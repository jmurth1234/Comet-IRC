if (Meteor.isClient) {
    Meteor.subscribe("IRCMessages");
    Meteor.subscribe("IRCChannels");
    Meteor.subscribe("IRCUsers");
    Meteor.subscribe("IRCConnections");

    serverMessages.listen('serverMessage:ping', function (title, message) {
        sendNotification(title, message);
    });

    Template.body.events({
        "click #logout": function(event) {
            Meteor.logout();
            location.hash = "";
        },
        "click .channel": function (event) {
            var currChannel = jQuery(event.target).text();
            console.log(currChannel);
            Session.set("currChannel", currChannel);
            Session.set("currServer", event.currentTarget.id);
        }
    });

    Template.body.helpers({
        messages: function() {
            return IRCMessages.find({channel: Session.get("currChannel")}, {sort: {date_time: 1}});
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

    Template.serverconnect.events({
        "submit form": function(event) {
            // Prevent default browser form submit
            event.preventDefault();

            var json = {
                server: event.target.irc_server.value,
                name: event.target.irc_server_name.value,
                port: event.target.irc_port.value,
                password: event.target.irc_password.value,
                nickname: event.target.irc_nick.value,
                channel: event.target.channel.value
            };

            channel = event.target.channel.value;

            console.log(json);

            Meteor.call("connectServer", json);

            jQuery('#connectModal').foundation('reveal', 'close');
        }
    });

    Template.channelmsg.events({
        "submit form": function(event) {
            // Prevent default browser form submit
            event.preventDefault();

            var json = {
                channel: Session.get("currChannel"),
                server: Session.get("currServer"),
                message: event.target.irc_msg.value,
            };

            Meteor.call("sendMessage", json);

            event.target.irc_msg.value = "";
        }
    });

    Template.loginform.events({

        'click #login': function(e, t) {
            e.preventDefault();
            // retrieve the input field values
            var username = t.find('#username').value;
            var password = t.find('#password').value;

            // Trim and validate your fields here....

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

        jQuery(document).foundation(function (response) {
            console.log(response.errors);
        });

        var vph = jQuery(window).height();
        jQuery(".panel").height(vph - 95);

        if (!Meteor.userId()) {
            jQuery('#loginModalLink').trigger('click');
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
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notification");
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

    Meteor.publish("IRCMessages", function() {
        return IRCMessages.find({
            user: this.userId
        });
    });

    Meteor.publish("IRCChannels", function() {
        return IRCChannels.find({
            user: this.userId
        });
    });

    Meteor.publish("IRCUsers", function() {
        return IRCUsers.find({
            user: this.userId
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
            console.log(json);

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

            var client = connections.getItem(json.server);

            if (json.message.indexOf("/me") == 0)
                client.action(json.channel, json.message);
            else
                client.say(json.channel, json.message);
        }
    });

}
