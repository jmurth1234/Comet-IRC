if (Meteor.isClient) {
    var ITEMS_INCREMENT = 200;

    //Meteor.subscribe("IRCMessages", Session.get('itemsLimit'));
    Meteor.subscribe("IRCChannels");
    Meteor.subscribe("IRCPings");
    Meteor.subscribe("IRCConnections");

    serverMessages.listen('serverMessage:' + Meteor.userId(), function (title, message) {
        sendNotification(title, message);
    });

    Template.body.events({
        "click #loadmore": function(event) {
            var channel = Session.get("currChannel");
            Session.set(channel + "Limit", Session.get(channel + "Limit") + ITEMS_INCREMENT );
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


    Template.navbar.helpers({
        users: function() {
            var users = [];
            var voiced = [];
            var opped = [];
            var list = IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser_sorting: 1}}).fetch();

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
        isLoaded: function () {
            return Session.get("loaded");
        },
        hasNotifications: function () {
            return (IRCPings.find({}, {sort: {date_time: -1}}).length != 0);
        },
        notifications: function () {
            return IRCPings.find({}, {sort: {date_time: -1}});
        }
    });


    Template.body.helpers({
        messages: function() {
            var list = [];
            var messages =  IRCMessages.find({channel: Session.get("currChannel")}, {sort: {date_time: -1}, transform: function(doc) {
                if(doc.text) {
                    doc.text = doc.text.autoLink({ target: "_blank", rel: "nofollow", id: "1" });
                }
                return doc;
            }}).fetch();

            for (i = 0; i < messages.length; i++) {
                var message = messages[i];
                list.push(message);
            }

            return list.reverse();
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

        jQuery(".channelmsg").on('keydown', '#msginput', function(e) {
            var input = document.getElementById('msginput');

            var keyCode = e.keyCode || e.which;

            if (keyCode == 9) {
                e.preventDefault();

                var list = IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser_sorting: 1}});

                list.forEach(function (user) {
                    if (user.ircuser_norank.startsWith(input.value)) {
                        input.value = user.ircuser_norank + ": ";
                    }
                });
            }
        });
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
        },
        "click #tabbutton": function (e) {
            var input = document.getElementById('msginput');
            var list = IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser_sorting: 1}});

            list.forEach(function (user) {
                if (user.ircuser_norank.startsWith(input.value)) {
                    input.value = user.ircuser_norank + ": ";
                }
            });
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
                    document.getElementById('loginSuccess').show();
                    document.getElementById('loginModal').toggle();
                } else {
                    document.getElementById('loginFailure').show();
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
                    document.getElementById('registerSuccess').show();
                    document.getElementById('loginModal').toggle();
                } else {
                    document.getElementById('registerFailure').show();
                }
            });
            return false;
        }
    });


    Template.body.rendered = function() {
        var vph = jQuery(window).height();
        jQuery(".panel").height(vph - 95);

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

        Session.set("loaded", false);

        // shitty workaround
        setTimeout(function () {
            console.log("loaded");

            if (!Meteor.userId()) {
                document.getElementById('loginModal').toggle();
            }

            Session.set("loaded", true);

        }, 2000);

    }

    window.onresize = window.onload = function () {
        var vph = jQuery(window).height();

        if (jQuery("paper-tabs").css("display") === "none")
            jQuery(".panel").height(vph - 98);
        else
            jQuery(".panel").height(vph - 150);
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

    Meteor.publish("IRCPings", function() {
        return IRCPings.find({
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
