if (Meteor.isClient) {
    var ITEMS_INCREMENT = 200;

    //Meteor.subscribe("IRCMessages", Session.get('itemsLimit'));
    Meteor.subscribe("IRCChannels");
    Meteor.subscribe("IRCConnections");

    serverMessages.listen('serverMessage:' + Meteor.userId(), function (title, message) {
        sendNotification(title, message);
    });

    Template.body.events({
        "click #loadmore": function(event) {
            Session.set(channel + "Limit", Session.get(channel + "Limit") + ITEMS_INCREMENT );
            Meteor.subscribe("IRCMessages", Session.get(channel + "Limit"), channel);
        },
    });

    Template.channel.events({
        "click .channel": function (event) {
            var currChannel = jQuery(event.target).text();
            Session.set(currChannel + "Limit", ITEMS_INCREMENT);
            Meteor.subscribe("IRCMessages", Session.get(currChannel + "Limit"), currChannel);
            Meteor.subscribe("IRCUsers", currChannel);

            Session.set("currChannel", currChannel);
            Session.set("currServer", event.currentTarget.id);
        }
    });

    Template.navbar.events({
        "click #connectModalLink": function (event) {
            console.log("test");
            document.getElementById('connectModal').toggle();
        },
        "click #logout": function(event) {
            Meteor.logout();
            location.hash = "";
        },
        "click #loginModalLink": function () {
            document.getElementById('loginModal').toggle();
        }
    });

    Template.body.helpers({
        messages: function() {
            var list = [];
            var messages =  IRCMessages.find({channel: Session.get("currChannel")}, {sort: {date_time: -1}, transform: function(doc) {
                if(doc.text) {
                    doc.text = doc.text.autoLink({ target: "_blank", rel: "nofollow", id: "1" });
                    console.log(doc.text);
                }
                return doc;
            }});

            messages.forEach(function (message) {
                list.push(message);
            });

            return list.reverse();
        },

        users: function() {
            return IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser: 1}});
        },


        channels: function() {
            var list = [];
            var servers = IRCConnections.find({});
            servers.forEach(function (server) {
                list.push({name: server.server_name, title: true});
                var channels = IRCChannels.find({server: server._id}, {sort: { sortChannel: 1 }});
                channels.forEach(function (element) {
                    list.push({name: element.channel, title: false, server_id: server._id});
                });
            });
            return list;
        }
    });

    Template.message.rendered = function(){
        jQuery('#messages').scrollTop( jQuery('#messages').prop("scrollHeight") );
    };

    Template.channelmsg.rendered = function () {
        if (Meteor.Device.isPhone())
            jQuery("#msginput").attr("autocomplete", "on");
    }

    Template.serverconnect.events({
        "submit form": function(e, t) {
            // Prevent default browser form submit
            e.preventDefault();

            var json = {
                server: t.find("#irc_server").value,
                name: t.find("#irc_server_name").value,
                port: t.find("#irc_port").value,
                password: t.find("#irc_password").value,
                nickname: t.find("#irc_nick").value,
                channel: t.find("#channel").value
            };

            console.log(json);

            Meteor.call("connectServer", json);

            document.getElementById('connectModal').toggle();
        },
        "click #cancelButton": function () {
            document.getElementById('connectModal').toggle();
        }
    });

    Template.channelmsg.events({
        "submit form": function(e, t) {
            // Prevent default browser form submit
            e.preventDefault();

            var json = {
                channel: Session.get("currChannel"),
                server: Session.get("currServer"),
                message: t.find("#msginput").value,
            };

            Meteor.call("sendMessage", json);

            t.find("#msginput").value = "";
        }
    });

    Template.loginform.events({

        'click #login': function(e, t) {
            e.preventDefault();
            // retrieve the input field values
            var username = t.find('#username').value;
            var password = t.find('#password').value;

            // If validation passes, supply the appropriate fields to the
            // Meteor.loginWithPassword() function.
            Meteor.loginWithPassword(username, password, function(err) {
                if (!err) {
                    swal({
                        title: "Login success!",
                        type: "success"
                    }, function() {
                        $('#loginModal').foundation('reveal', 'close');
                    });
                } else {
                    swal({
                        title: "Login failed!",
                        type: "warning"
                    });
                }
            });
            return false;
        },

        'click #signup': function(e, t) {
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
            }, function(err) {
                if (!err) {
                    swal({
                        title: "Registration succeeded!",
                        type: "success"
                    }, function() {
                        $('#loginModal').foundation('reveal', 'close');
                    });
                } else {
                    swal({
                        title: "Registration failed!",
                        type: "warning"
                    });
                }
            });
            return false;
        }
    });


    Template.body.rendered = function() {
        console.log("loaded");
        var vph = jQuery(window).height();
        jQuery(".panel").height(vph - 95);

        if (!Meteor.userId()) {
            document.getElementById('loginModal').toggle();
        }

        jQuery(document).on('closed.fndtn.reveal', '[data-reveal]', function() {
            var modal = jQuery(this);
            if (modal.attr('id') === "loginModal") {
                console.log("closing loginModal!");
                if (!Meteor.userId()) {
                    console.log("not logged in! opening loginModal!");
                    jQuery('#loginModalLink').trigger('click');
                }
            }
        });

    }

    window.onresize = function () {
        var vph = jQuery(window).height();
        jQuery(".panel").height(vph - 95);
    }

    function sendNotification(title, message) {
        if (Meteor.isCordova) {
            cordova.plugins.notification.local.schedule({
                title: title,
                message: message
            });
        }
        else
        if (!("Notification" in window)) {
            //alert("This browser does not support desktop notification");
            toastr.info(message, title)

        }
        else if (Notification.permission === "granted") {
            var options = {
                body: message,
                dir : "ltr"
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
                        dir : "ltr"
                    };
                    var notification = new Notification(title, options);
                }
            });
        }
    }
}

if (Meteor.isServer) {
    var connections = new HashMap1d();

    Meteor.publish("IRCMessages", function(limit, currChannel) {
        return IRCMessages.find({
            user: this.userId,
            channel: currChannel
        }, {limit: limit, sort: {date_time: -1}});
    });

    Meteor.publish("IRCChannels", function() {
        return IRCChannels.find({
            user: this.userId
        });
    });

    Meteor.publish("IRCUsers", function(currChannel) {
        return IRCUsers.find({
            user: this.userId,
            channel: currChannel
        });
    });

    Meteor.publish("IRCConnections", function() {
        return IRCConnections.find({
            user: this.userId
        });
    });

    Meteor.startup(function() {
        IRCMessages.remove({});
        IRCConnections.remove({});
        IRCUsers.remove({});
        IRCChannels.remove({});
    });

    Meteor.methods({
        connectServer: function(json) {
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
                channels: [],
                user: Meteor.userId(),
                stripColors: true
            };

            var client = new IRC(params);
            client.connect();

            connections.addItem(serverId, client);

            Meteor.setTimeout(function() {
                client.join(json.channel);
            }, 10000);
        },

        sendMessage: function(json) {
            if (!Meteor.userId()) {
                return;
            }

            if (json.message == "") {
                return;
            }

            var client = connections.getItem(json.server);

            if (json.message.indexOf("/me") == 0)
                client.action(json.channel, json.message);
            else
                client.say(json.channel, json.message);
        }
    });

}