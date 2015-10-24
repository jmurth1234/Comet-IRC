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
        var messages = jQuery('#messages');
        messages.scrollTop( messages.prop("scrollHeight") );
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

        jQuery(".channelmsg").on('keydown', '#msginput', function(e) {
            var input = document.getElementById('msginput');

            var keyCode = e.keyCode || e.which;

            if (keyCode == 9) {
                e.preventDefault();

                var words = input.value.split(" ");
                var word  = words[words.length - 1];
                var isFirst = words.length === 1;

                var list = IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser_sorting: 1}});

                list.forEach(function (user) {
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
                    }
                });
            }
        });
    };

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
                channel: t.find("#channel").value,
                znc: t.find("#znc").value
            };

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

            var words = input.value.split(" ");
            var word  = words[words.length - 1];
            var isFirst = words.length === 1;

            var list = IRCUsers.find({channel: Session.get("currChannel")}, {sort: {ircuser_sorting: 1}});

            list.forEach(function (user) {
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
                }
            });

            input.focus();
        },
        "click #addbutton": function (e) { document.getElementById('imageitModal').toggle() },
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

    };

    Template.imageit.rendered = function () {
        document.getElementById('fileInput').addEventListener('change', submitForm);
        document.getElementById('paste').addEventListener('paste', handlePaste);
        var msgInput = document.getElementById('msginput');

        function submitForm() {
            console.log("caught it");
            var uploader = document.getElementById('fileInput');
            if (uploader.files.length == 0) {
                return;
            } else {
                uploadFile(uploader.files[0]);
            }
        }

        // Minified version of isMobile
        (function (i) {
            var e = /iPhone/i, n = /iPod/i, o = /iPad/i, t = /(?=.*\bAndroid\b)(?=.*\bMobile\b)/i, r = /Android/i, d = /BlackBerry/i, s = /Opera Mini/i, a = /IEMobile/i, b = /(?=.*\bFirefox\b)(?=.*\bMobile\b)/i, h = RegExp("(?:Nexus 7|BNTV250|Kindle Fire|Silk|GT-P1000)", "i"), c = function (i, e) {
                return i.test(e)
            }, l = function (i) {
                var l = i || navigator.userAgent;
                this.apple = {
                    phone: c(e, l),
                    ipod: c(n, l),
                    tablet: c(o, l),
                    device: c(e, l) || c(n, l) || c(o, l)
                }, this.android = {
                    phone: c(t, l),
                    tablet: !c(t, l) && c(r, l),
                    device: c(t, l) || c(r, l)
                }, this.other = {
                    blackberry: c(d, l),
                    opera: c(s, l),
                    windows: c(a, l),
                    firefox: c(b, l),
                    device: c(d, l) || c(s, l) || c(a, l) || c(b, l)
                }, this.seven_inch = c(h, l), this.any = this.apple.device || this.android.device || this.other.device || this.seven_inch
            }, v = i.isMobile = new l;
            v.Class = l
        })(window);

        if (!isMobile.any) {
            if (!window.Clipboard) {
                var pasteCatcher = document.getElementById("paste");
                // Firefox allows images to be pasted into contenteditable elements
                pasteCatcher.setAttribute("contenteditable", "");
                // as long as we make sure it is always in focus
                pasteCatcher.focus();
                document.addEventListener("click", function () {
                    pasteCatcher.focus();
                });
            }
        }

        /* Handle paste events */
        function handlePaste(e) {
            // We need to check if event.clipboardData is supported (Chrome)
            if (e.clipboardData) {
                // Get the items from the clipboard
                var items = e.clipboardData.items;
                if (items) {
                    // Loop through all items, looking for any kind of image
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf("image") !== -1) {
                            // We need to represent the image as a file,
                            var blob = items[i].getAsFile();
                            // and use a URL or webkitURL (whichever is available to the browser)
                            // to create a temporary URL to the object
                            var URLObj = window.URL || window.webkitURL;
                            var source = URLObj.createObjectURL(blob);

                            // The URL can then be used as the source of an image
                            uploadFile(blob);
                        }
                    }
                }
                // If we can't handle clipboard data directly (Firefox),
                // we need to read what was pasted from the contenteditable element
            } else {
                // This is a cheap trick to make sure we read the data
                // AFTER it has been inserted.
                console.log("Getting image from contenteditable");
                setTimeout(checkInput, 1);
            }
        }

        /* Parse the input in the paste catcher element */
        function checkInput() {
            // Store the pasted content in a variable
            var child = pasteCatcher.childNodes[0];

            // Clear the inner html to make sure we're always
            // getting the latest inserted content
            pasteCatcher.innerHTML = "";

            if (child) {
                // If the user pastes an image, the src attribute
                // will represent the image as a base64 encoded string.
                if (child.tagName === "IMG") {
                    console.log("Got an image from contenteditable");
                    createImage(child);
                }
            }
        }

        /* Creates a new image from a given source */
        function createImage(source) {
            source.crossOrigin = 'Anonymous';
            console.log("Converting image to blob");
            var blob = dataUriToBlob(source.src);
            uploadFile(blob);
        }


        function dataUriToBlob(dataURI) {
            // serialize the base64/URLEncoded data
            var byteString;
            if (dataURI.split(',')[0].indexOf('base64') >= 0) {
                byteString = atob(dataURI.split(',')[1]);
            } else {
                byteString = unescape(dataURI.split(',')[1]);
            }

            // parse the mime type
            var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

            // construct a Blob of the image data
            var array = [];
            for (var i = 0; i < byteString.length; i++) {
                array.push(byteString.charCodeAt(i));
            }
            return new Blob(
                [new Uint8Array(array)], {
                    type: mimeString
                }
            );
        }

        function uploadFile(file) {
            var xhr = new XMLHttpRequest();

            document.getElementById("paste").innerHTML = "<IMG SRC='http://images.rymate.co.uk/images/3SddFB8.gif'></img>";

            xhr.upload.onprogress = function (e) {
                //$(".progress").show();
                var percentComplete = Math.ceil((e.loaded / e.total) * 100);
                //$("#info_text").text("Uploaded: " + percentComplete + "%");
                //$('.bar').width(percentComplete + "%");
                console.log("Uploaded: " + percentComplete + "%");
            };

            xhr.onload = function () {
                if (xhr.status == 200) {
                    if (top.window) {
                        console.log("window is avaliable");
                    }
                    console.log( "Window.location is " + top.window.location);
                    //top.window.location.href = " + xhr.response;
                    msgInput.value = msgInput.value + "http://images.rymate.co.uk/view/" + xhr.response;
                } else if (xhr.status == 413) {
                    alert("The image is too large! It must be 25MB or less.");
                } else {
                    alert("Something went wrong whilst uploading. This is probably a bug, so it'll be fixed soon!");
                }
            };

            xhr.onerror = function () {
                alert("Error! Upload failed. Can not connect to server.");
            };

            xhr.open("POST", "http://images.rymate.co.uk/upload", true);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
        }

    };

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
        IRCPings.remove({});
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
                znc: json.znc,
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
    var newDate = new Date(date.getTime()+date.getTimezoneOffset()*60*1000);

    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();

    newDate.setHours(hours - offset);

    return newDate;
}