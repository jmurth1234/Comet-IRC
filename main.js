if (Meteor.isClient) {
    var snapper;
    var ITEMS_INCREMENT = 200;

    //Meteor.subscribe("IRCMessages", Session.get('itemsLimit'));
    Meteor.subscribe("IRCChannels");
    //Meteor.subscribe("IRCPings");
    Meteor.subscribe("IRCConnections");

    serverMessages.listen('serverMessage:' + Meteor.userId(), function (title, message) {
        sendNotification(title, message);
    });

    Template.body.events({
        "click #loadmore": function (event) {
            var channel = Session.get("currChannel");
            Session.set(channel + "Limit", Session.get(channel + "Limit") + ITEMS_INCREMENT);
            Meteor.subscribe("IRCMessages", Session.get(channel + "Limit"), channel);
        },
    });

    var channelEvent = {
        "click .channel": function (event) {
            var currChannel = jQuery(event.target).text();
            Session.set(currChannel + "Limit", ITEMS_INCREMENT);
            Meteor.subscribe("IRCMessages", Session.get(currChannel + "Limit"), currChannel);
            Meteor.subscribe("IRCUsers", currChannel);

            Session.set("currChannel", currChannel);
            Session.set("currServer", event.currentTarget.id);
        }
    };


    Template.channel.events(channelEvent);
    Template.channeltab.events(channelEvent);

    Template.navbar.events({
        "click #logout": function (event) {
            Meteor.logout();
            location.hash = "";
        }
    });


    Template.navbar.helpers({
        hasNotifications: function () {
            return (IRCPings.find({}, {sort: {date_time: -1}}).count() != 0);
        },
        notifications: function () {
            return IRCPings.find({}, {sort: {date_time: -1}});
        },
        notificationsCount: function () {
            return IRCPings.find({}, {sort: {date_time: -1}}).count();
        }
    });


    Template.body.helpers({
        messages: function () {
            var list = [];
            var messages = IRCMessages.find({channel: Session.get("currChannel"), server: Session.get("currServer")}, {
                sort: {date_sort: -1}, transform: function (doc) {
                    if (doc.text) {
                        doc.text = doc.text.autoLink({target: "_blank", rel: "nofollow", id: "1"});
                    }
                    return doc;
                }
            }).fetch();

            for (i = 0; i < messages.length; i++) {
                var message = messages[i];

                var date = new Date(message.date_time);

                message.date_time = date.toString();

                var hours = date.getHours();
                var minutes = date.getMinutes();

                if (minutes < 10) {
                    minutes = "0" + minutes
                }

                message["time"] += hours + ":" + minutes;

                list.push(message);
            }

            return list.reverse();
        },

        channels: function () {
            var list = [];
            var servers = IRCConnections.find({});
            servers.forEach(function (server) {
                list.push({name: server.server_name, title: true});
                var channels = IRCChannels.find({server: server._id}, {sort: {sortChannel: 1}});
                channels.forEach(function (element) {
                    list.push({name: element.channel, title: false, server_id: server._id});
                });
            });
            return list;
        },

        users: function () {
            var users = [];
            var voiced = [];
            var opped = [];
            var list = IRCUsers.find({
                channel: Session.get("currChannel"),
                server: Session.get("currServer")
            }, {sort: {ircuser_sorting: 1}}).fetch();

            for (i = 0; i < list.length; i++) {
                var user = list[i];
                if (user.ircuser.startsWith("@")) {
                    opped.push(user);
                } else if (user.ircuser.startsWith("+")) {
                    voiced.push(user);
                } else {
                    users.push(user);
                }
            }

            return opped.concat(voiced).concat(users);
        },
    });

    Template.message.rendered = function () {
        var messages = jQuery('#messages');
        messages.scrollTop(messages.prop("scrollHeight"));
    };

    Template.message.events({
        "click .user": function (event) {
            var json = {
                server: event.currentTarget.id,
                user: jQuery(event.target).text()
            };

            Meteor.call("messageUser", json);

            var currChannel = jQuery(event.target).text();
            Session.set(currChannel + "Limit", ITEMS_INCREMENT);
            Meteor.subscribe("IRCMessages", Session.get(currChannel + "Limit"), currChannel);

            Session.set("currChannel", currChannel);
            Session.set("currServer", event.currentTarget.id);
        }
    });


    Template.user.events({
        "click .user": function (event) {
            var json = {
                server: event.currentTarget.id,
                user: jQuery(event.target).text()
            };

            Meteor.call("messageUser", json);

            var currChannel = jQuery(event.target).text();
            Session.set(currChannel + "Limit", ITEMS_INCREMENT);
            Meteor.subscribe("IRCMessages", Session.get(currChannel + "Limit"), currChannel);

            Session.set("currChannel", jQuery(event.target).text());
            Session.set("currServer", event.currentTarget.id);
        }
    })


    Template.channelmsg.rendered = function () {
        if (Meteor.Device.isPhone())
            jQuery("#msginput").attr("autocomplete", "on");

        jQuery(".channelmsg").on('keydown', '#msginput', function (e) {
            var input = document.getElementById('msginput');

            var keyCode = e.keyCode || e.which;

            if (keyCode == 9) {
                e.preventDefault();

                var words = input.value.split(" ");
                var word = words[words.length - 1];
                var isFirst = words.length === 1;

                var list = IRCUsers.find({
                    channel: Session.get("currChannel"),
                    server: Session.get("currServer")
                }, {sort: {ircuser_sorting: 1}}).fetch();


                for (i = 0; i < list.length; i++) {
                    var user = list[i];
                    if (word.length == 0) {
                        return;
                    }

                    if (user.ircuser_norank.startsWith(word)) {
                        if (isFirst) {
                            input.value = user.ircuser_norank + ": ";
                        } else {
                            words[words.length - 1] = words[words.length - 1].replace(word, user.ircuser_norank);
                            input.value = words.join(" ");
                        }
                        return;
                    }
                }
            }
        });
    };

    Template.serverconnect.events({
        "submit form": function (e, t) {
            // Prevent default browser form submit
            e.preventDefault();

            var json = {
                server: t.find("#irc_server").value,
                name: t.find("#irc_server_name").value,
                port: t.find("#irc_port").value,
                password: t.find("#irc_password").value,
                nickname: t.find("#irc_nick").value,
                ssl: t.find("#ssl").checked,
            };

            Meteor.call("connectServer", json, function(error, result){
                Session.set('currServer', result);
                toastr.info("If you didn't specify a channel to join, use the command /join", "You're now connected!")
            });

            $.modal.close();
        },
        "click #cancelButton": function () {
            $.modal.close();
        }
    });

    Template.channelmsg.events({
        "submit form": function (e, t) {
            // Prevent default browser form submit
            e.preventDefault();

            var json = {
                channel: Session.get("currChannel"),
                server: Session.get("currServer"),
                message: t.find("#msginput").value,
            };

            Meteor.call("sendMessage", json);

            t.find("#msginput").value = "";
        },
        "click #tabbutton": function (e) {
            var input = document.getElementById('msginput');

            var words = input.value.split(" ");
            var word = words[words.length - 1];
            var isFirst = words.length === 1;

            var list = IRCUsers.find({
                channel: Session.get("currChannel"),
                server: Session.get("currServer")
            }, {sort: {ircuser_sorting: 1}}).fetch();

            for (i = 0; i < list.length; i++) {
                var user = list[i];
                if (word.length == 0) {
                    return;
                }

                if (user.ircuser_norank.startsWith(word)) {
                    if (isFirst) {
                        input.value = user.ircuser_norank + ": ";
                    } else {
                        words[words.length - 1] = words[words.length - 1].replace(word, user.ircuser_norank);
                        input.value = words.join(" ");
                    }
                    return;
                }
            }

            input.focus();
        },
        "click #addbutton": function (e) {
            document.getElementById('imageitModal').toggle()
        },
        "click #leftMenu": function (e) {
            snapper.open('left');
        },
        "click #rightMenu": function (e) {
            snapper.open('right');
        }
    });

    Template.loginform.events({
        "submit form": function (e, t) {
            e.preventDefault();
            // retrieve the input field values
            var username = t.find('#username').value;
            var password = t.find('#password').value;

            // If validation passes, supply the appropriate fields to the
            // Meteor.loginWithPassword() function.
            Meteor.loginWithPassword(username, password, function (err) {
                if (!err) {
                    document.getElementById('loginSuccess').show();
                    document.getElementById('loginModal').toggle();
                } else {
                    document.getElementById('loginFailure').show();
                }
            });
            return false;
        },
        'click #login': function (e, t) {
            e.preventDefault();
            // retrieve the input field values
            var username = t.find('#username').value;
            var password = t.find('#password').value;

            // If validation passes, supply the appropriate fields to the
            // Meteor.loginWithPassword() function.
            Meteor.loginWithPassword(username, password, function (err) {
                if (!err) {
                    $.modal.close();
                    toastr.info("", "Logged in!")
                } else {
                    toastr.info("", "An error occurred! Check your username and password is correct")
                }
            });
            return false;
        },

        'click #signup': function (e, t) {
            e.preventDefault();
            // retrieve the input field values
            var username = t.find('#username').value;
            var password = t.find('#password').value;

            // Trim and validate your fields here....

            // If validation passes, supply the appropriate fields to the
            // Meteor.loginWithPassword() function.
            Accounts.createUser({
                username: username,
                password: password
            }, function (err) {
                if (!err) {
                    $.modal.close();
                    toastr.info("", "Logged in!")
                } else {
                    toastr.info("", "An error occurred! Your username probably already exists.")
                }
            });
            return false;
        }
    });


    Template.body.rendered = function () {
        var vph = jQuery(window).height();
        jQuery("#messages").height(vph - 130);

        jQuery('.ui.checkbox').checkbox();

        jQuery('select.dropdown').dropdown();

        if (window.innerWidth <= 800) {
            snapper = new Snap({
                element: document.getElementById('mainContent'), hyperextensible: false,
            });
        }

        window.onresize = function () {
            var vph = jQuery(window).height();
            jQuery("#messages").height(vph - 130);
        }

        if (!Meteor.userId()) {
            $("#loginModal").modal({
                escapeClose: false,
                clickClose: false,
                showClose: false
            });
        }

    };

    window.onresize = window.onload = function () {
        var vph = jQuery(window).height();

        jQuery(".panel").height(vph - 120);

        if (window.innerWidth <= 800) {
            snapper = new Snap({
                element: document.getElementById('mainContent'), hyperextensible: false,
            });
        }
    }

    function sendNotification(title, message) {
        if (Meteor.isCordova) {
            cordova.plugins.notification.local.schedule({
                title: title,
                message: message
            });
        }
        else if (!("Notification" in window)) {
            //alert("This browser does not support desktop notification");
            toastr.info(message, title)

        }
        else if (Notification.permission === "granted") {
            var options = {
                body: message,
                dir: "ltr"
            };
            var notification = new Notification(title, options);
        }
        else if (Notification.permission !== 'denied') {
            Notification.requestPermission(function (permission) {
                if (!('permission' in Notification)) {
                    Notification.permission = permission;
                }

                if (permission === "granted") {
                    var options = {
                        body: message,
                        dir: "ltr"
                    };
                    var notification = new Notification(title, options);
                }
            });
        }
    }
}

if (Meteor.isServer) {
    var connections = new HashMap1d();

    Meteor.publish("IRCMessages", function (limit, currChannel) {
        return IRCMessages.find({
            user: this.userId,
            channel: currChannel
        }, {limit: limit, sort: {date_sort: -1}});
    });

    Meteor.publish("IRCChannels", function () {
        return IRCChannels.find({
            user: this.userId
        });
    });

    Meteor.publish("IRCPings", function () {
        return IRCPings.find({
            user: this.userId
        });
    });

    Meteor.publish("IRCUsers", function (currChannel) {
        return IRCUsers.find({
            user: this.userId,
            channel: currChannel
        });
    });

    Meteor.publish("IRCConnections", function () {
        return IRCConnections.find({
            user: this.userId
        });
    });

    Meteor.startup(function () {
        IRCMessages.remove({});
        IRCConnections.remove({});
        IRCUsers.remove({});
        IRCChannels.remove({});
        IRCPings.remove({});
    });

    Meteor.methods({
        connectServer: function (json) {
            if (!Meteor.userId()) {
                return;
            }

            if (json.name == "") {
                json.name = json.server;
            }

            var serverId = IRCConnections.insert({
                server_name: json.name,
                user: Meteor.userId()
            });

            var params = {
                server: json.server,
                server_id: serverId,
                port: json.port,
                nick: json.nickname,
                password: json.password,
                realname: json.nickname,
                username: json.nickname,
                ssl: json.ssl,
                channels: [],
                user: Meteor.userId(),
                stripColors: true
            };

            var client = new IRC(params);
            client.connect();

            connections.addItem(serverId, client);

            if (json.channel !== "") {
                Meteor.setTimeout(function () {
                    client.join(json.channel);
                }, 10000);
            }

            return serverId;
        },

        sendMessage: function (json) {
            if (!Meteor.userId()) {
                return;
            }

            if (json.message == "") {
                return;
            }

            var client = connections.getItem(json.server);

            if (json.message.indexOf("/me") == 0) {
                client.action(json.channel, json.message);
            } else if (json.message.indexOf("/join") == 0) {
                client.join(json.message.replace("/join ", ""));
            } else if (json.message.indexOf("/part") == 0) {
                client.part(json.message.replace("/part ", ""));
            } else if (json.message.indexOf("/quit") == 0) {
                client.disconnect(json.message.replace("/quit ", ""));
            } else {
                client.say(json.channel, json.message);
            }
        },

        messageUser: function (json) {
            console.log(json.user + " " + json.server);
            IRCChannels.insert({
                channel: json.user,
                server: json.server,
                sortChannel: json.user,
                user: Meteor.userId()
            });
        }
    });

}

function localize_date(date) {
    var newDate = new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);

    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();

    newDate.setHours(hours - offset);

    return newDate;
}
