var net = Npm.require('net');
var tls = Npm.require('tls');

/**
 * IRC Constructor
 *
 * Creates the IRC instance
 * @param params optional preferences for the connection
 */
IRC = function IRC(params) {
    this.connection = null;
    this.buffer = '';
    this.options = {
        server: (params && params.server) || 'irc.freenode.net',
        port: (params && params.port) || 6667
    };
    this.config = {
        nick: (params && params.nick) || 'meteorirc',
        password: (params && params.password) || '',
        realname: (params && params.realname) || 'Meteor IRC',
        username: (params && params.username) || 'Meteor-IRC',
        channels: (params && params.channels) || [],
        debug: (params && params.debug) || true,
        user: (params && params.user) || 0,
        server_id: (params && params.server_id) || "",
        stripColors: (params && params.stripColors) || true,
        znc: (params && params.znc) || false,
        ssl: (params && params.ssl) || false
    };

    this.channels = ["something"];
};

/**
 * connect
 *
 * Connects to the IRC server, sets up listeners for certain events
 */
IRC.prototype.connect = function() {
    var self = this;
    try {
        // socket opts
        var connectionOptions = {
            host: self.options.server,
            port: self.options.port,
            rejectUnauthorized: false
        };


        if (self.config.ssl) {
            console.log('connecting vis ssl');
            self.connection = tls.connect(connectionOptions, function () {
                // callback called only after successful socket connection
                self.connection.connected = true;
                self.connection.setEncoding('utf8');

                self.send('NICK', self.config.nick);
                self.send('USER', self.config.username, 8, "*", self.config.realname);

                if (self.config.znc) {
                    self.send('CAP', 'LS');
                    self.send('CAP', 'REQ', 'znc.in/server-time-iso');
                    self.send('CAP', 'END');
                }

                if (self.config.password !== "")
                    self.send('PASS', self.config.password);

                _.each(self.config.channels, function (channel) {
                    self.send('JOIN', channel);
                });
            });
        } else {
            self.connection = net.createConnection(self.options.port, self.options.server, function() {
                if (self.config.debug) console.log('connecting...');
            });
        }



        this.connection.addListener('connect', function() {
            self.send('NICK', self.config.nick);
            self.send('USER', self.config.username, 8, "*", self.config.realname);

            if (self.config.znc) {
                self.send('CAP', 'LS');
                self.send('CAP', 'REQ', 'znc.in/server-time-iso');
                self.send('CAP', 'END');
            }

            if (self.config.password !== "")
                self.send('PASS', self.config.password);

            _.each(self.config.channels, function(channel) {
                self.send('JOIN', channel);
            });
        });

        //wrap in a meteor environment in order to use x.insert()
        //fixme: on motd, identify with nickserv
        this.connection.addListener('data', Meteor.bindEnvironment(function(chunk) {
            self.buffer += chunk;
            var lines = self.buffer.split("\r\n");
            self.buffer = lines.pop();
            console.log(lines);
            lines.forEach(function(dirtyLine) {
                var line = self.parseLine(dirtyLine);

                switch (line.command) {
                    case "PING":
                        self.send("PONG", line.args[0]);
                        break;
                    case "VERSION":
                        self.send("METEOR-IRC 1.0", line.args[0]);
                        break;
                    case "NOTICE":
                        var nick = line.nick ? line.nick.toLowerCase() : '';
                        var text = line.args[1] ? line.args[1].toLowerCase() : '';
                        if (nick === 'nickserv') {
                            if (text.indexOf('registered') != -1) {
                                self.say('nickserv', 'IDENTIFY ' + self.config.password);
                            } else if (text.indexOf('invalid') != -1) {
                                self.nick(self.config.nick + Math.floor(Math.random() * 10));
                            }
                        }
                        break;
                    case "PRIVMSG":
                        var handle = line.nick;
                        var channel = line.args[0];

                        if (line.args[0] == self.config.nick) {
                            channel = handle;
                        }

                        var text = line.args[1];
                        var action = false;
                        if (text.substring(1, 7) === 'ACTION') {
                            var text = text.substring(8);
                            action = true;
                        }

                        var date;
                        if ("server_time" in line)
                            date = line.server_time;

                        var highlighted = text.indexOf(self.config.nick) !== -1;
                        if (highlighted) {
                            console.log("mentioned!")
                            serverMessages.notify('serverMessage:' + self.config.user, "You were mentioned in " + channel + " by " + handle, text);

                            IRCPings.insert({
                                handle: handle,
                                channel: channel,
                                server: self.config.server_id,
                                text: escapeHtml(text),
                                date_time: date || new Date(),
                                action: action,
                                user: self.config.user
                            });
                        }

                        addMessageToDb(self, channel, handle, text, action, date, highlighted);

                        if (self.channels.indexOf(channel) === -1) {
                            self.channels.push(channel);
                            IRCChannels.insert({
                                channel: channel,
                                server: self.config.server_id,
                                sortChannel: channel.toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                                user: self.config.user
                            });
                        }

                        break;
                    case "QUIT":
                        // TODO
                        break;
                    case "PART":
                        addMessageToDb(self, line.args[0], "", line.prefix + " left the channel!", true);

                        if (self.channels.indexOf(line.args[0]) === -1) {
                            self.channels.push(line.args[0]);
                            IRCChannels.insert({
                                channel: line.args[0],
                                server: self.config.server_id,
                                sortChannel: line.args[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                                user: self.config.user,
                            });
                        }

                        break;
                    case "JOIN":
                        addMessageToDb(self, line.args[0], "", line.prefix + " joined the channel!", true);

                        if (self.channels.indexOf(line.args[0]) === -1) {
                            self.channels.push(line.args[0]);
                            IRCChannels.insert({
                                channel: line.args[0],
                                server: self.config.server_id,
                                sortChannel: line.args[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                                user: self.config.user,
                            });
                        }

                        break;
                    case "353":
                        if (line.args[0] !== self.config.nick)
                            self.config.nick = line.args[0];

                        var userList = line.args[3].split(" ");

                        //var addUsers = function (userList) {
                        Meteor.defer( function () {
                                userList.forEach(function (s) {
                                    var user_sorting = s.toLowerCase().replace("@", "").replace("+", "");
                                    var user_norank = s.replace("@", "").replace("+", "");
                                    IRCUsers.insert({
                                        channel: line.args[2],
                                        server: self.config.server_id,
                                        ircuser: s,
                                        ircuser_norank: user_norank,
                                        ircuser_sorting: user_sorting,
                                        user: self.config.user,
                                    });
                                })
                            }
                        );

                        //var addUsersAsync = Meteor.wrapAsync(addUsers);
                        //addUsersAsync(userList);

                        break;
                    case "332":
                        addMessageToDb(self, line.args[1], "Channel Topic: ", line.args[2], true);
                        break;
                    case "NICK":
                        // TODO: handle nick changes
                        // DEPENDS ON LIST OF USERS
                        break;
                    case "433":
                        self.send('NICK', self.config.nick + "_");
                        self.send('USER', self.config.username, 8, "*", self.config.realname);

                        if (self.config.znc) {
                            self.send('CAP', 'LS');
                            self.send('CAP', 'REQ', 'znc.in/server-time-iso');
                            self.send('CAP', 'END');
                        }

                        if (self.config.password !== "")
                            self.send('PASS', self.config.password);

                        _.each(self.config.channels, function(channel) {
                            self.send('JOIN', channel);
                        });
                        break;
                    default:
                        break;
                }
            });
        }, function(e) {
            Meteor._debug("Exception from connection close callback:", e);
        }));

        this.connection.addListener('drain', function() {
            self.buffer = '';
        });

        this.connection.addListener('close', function() {
            if (self.config.debug) console.log('disconnected');
        })

        function addMessageToDb(self, chan, user, message, action, date, highlighted) {
            if (date === undefined) {
                date = new Date();
            }

            if (highlighted === undefined) {
                highlighted = false;
            }

            date = date || new Date();

            var cssClass = [];

            if (highlighted) {
                cssClass.push("highlight");
            }

            if (user === self.config.nick) {
                cssClass.push("self");
            }

            //insert irc message into db
            IRCMessages.insert({
                handle: user,
                channel: chan,
                server: self.config.server_id,
                text: escapeHtml(message),
                css: cssClass.join(" "),
                date_time: date.toString(),
                date_sort: date,
                time: "",
                action: action,
                user: self.config.user,
                irc: true,
                bot: false
            });
        }

    } catch (e) {
        console.log(e);
        self.disconnect("An error occurred in this irc client, bailing!");

        IRCConnections.remove({server: self.config.server_id});
        IRCUsers.remove({server: self.config.server_id});
        IRCChannels.remove({server: self.config.server_id});

    }

};

/**
 *join
 *
 * sends a join command to the irc server
 * @param channel to join
 */
IRC.prototype.join = function(channel) {
    if (this.connection) {
        this.send.apply(this, ['JOIN'].concat(channel));
        IRCChannels.insert({
            channel: channel,
            server: this.config.server_id,
            sortChannel: channel.toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
            user: this.config.user,
        });
    }
};

/**
 *part
 *
 * sends a part command to the irc server
 * @param channel to part
 */
IRC.prototype.part = function(channel) {
    if (this.connection) {
        this.send.apply(this, ['PART'].concat(channel));
        IRCChannels.remove({
            channel: channel,
            server: this.config.server_id,
            sortChannel: channel.toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
            user: this.config.user,
        });
    }
};

/**
 *nick
 *
 * sends a nick command to the irc server
 * @param nickname
 */
IRC.prototype.nick = function(nickname) {
    if (this.connection) {
        this.send.apply(this, ['NICK'].concat(nickname));
    }
};

/**
 * send
 *
 * sends a command to the irc server
 * @param command the command to send to the irc server
 */
IRC.prototype.send = function(command) {
    var args = Array.prototype.slice.call(arguments);

    if (args[args.length - 1].match(/\s/) || args[args.length - 1].match(/^:/) || args[args.length - 1] === "") {
        args[args.length - 1] = ":" + args[args.length - 1];
    }

    if (this.connection) {
        this.connection.write(args.join(" ") + "\r\n");
    }
};

/**
 * say
 *
 * a convenience method that sends a message to a channel or user
 * @param channel the channel to send to
 * @param message the message
 */
IRC.prototype.say = function(channel, message) {
    //insert irc message into db
    var date = new Date();
    var currentTime = "";
    var hours = date.getHours();
    var minutes = date.getMinutes();

    if (minutes < 10) {
        minutes = "0" + minutes
    }

    currentTime += hours + ":" + minutes;

    IRCMessages.insert({
        handle: this.config.nick,
        server: this.config.server_id,
        channel: channel,
        text: escapeHtml(message),
        date_time: date.toString(),
        date_sort: date,
        time: "",
        action: false,
        user: this.config.user,
        irc: true,
        bot: false
    });

    this.send('PRIVMSG', channel, message);
};

IRC.prototype.action = function(channel, message) {
    //insert irc message into db
    var date = new Date()
    var currentTime = "";
    var hours = date.getHours();
    var minutes = date.getMinutes();

    if (minutes < 10) {
        minutes = "0" + minutes
    }

    currentTime += hours + ":" + minutes;

    IRCMessages.insert({
        handle: this.config.nick,
        server: this.config.server_id,
        channel: channel,
        text: escapeHtml(message.replace("/me ", "")),
        date_time: date.toString(),
        date_sort: date,
        time: "",
        action: true,
        user: this.config.user,
        irc: true,
        bot: false
    });

    this.send('PRIVMSG', channel, "\u0001" + "ACTION " + message.replace("/me ", "") + "\u0001");
};

/**
 * disconnect
 *
 * disconnects from a server
 * @param msg the quit message
 */
IRC.prototype.disconnect = function(msg) {
    var message = msg || 'Powered by Comet-IRC https://github.com/rymate1234/Comet-IRC';
    this.send("QUIT", message);

    IRCConnections.remove({server: this.config.server_id});
    IRCUsers.remove({server: this.config.server_id});
    IRCChannels.remove({server: this.config.server_id});

    this.connection.end();
};

/**
 * parseLine
 *
 * transforms response from irc server into something usable
 * @param line the raw object received from the irc server
 */
IRC.prototype.parseLine = function(line) {
    var message = {};
    var match;
    var stripColors = this.config.stripColors || true;

    if (line.indexOf("@") == 0) {
        var messageSplit = line.split(" ");
        var prefixVar = messageSplit.shift();

        line = messageSplit.join(" ");

        message.server_time = new Date(prefixVar.replace("@time=", ""));
    }

    if (stripColors) {
        line = line.replace(/[\x02\x1f\x16\x0f]|\x03\d{0,2}(?:,\d{0,2})?/g, "");
    }

    // Parse prefix
    if (match = line.match(/^:([^ ]+) +/)) {
        message.prefix = match[1];
        line = line.replace(/^:[^ ]+ +/, '');
        if (match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/)) {
            message.nick = match[1];
            message.user = match[3];
            message.host = match[4];
        } else {
            message.server = message.prefix;
        }
    }

    // Parse command
    match = line.match(/^([^ ]+) */);
    message.command = match[1];
    message.rawCommand = match[1];
    message.commandType = 'normal';
    line = line.replace(/^[^ ]+ +/, '');

    message.args = [];
    var middle, trailing;

    // Parse parameters
    if (line.search(/^:|\s+:/) != -1) {
        match = line.match(/(.*?)(?:^:|\s+:)(.*)/);
        middle = match[1].trimRight();
        trailing = match[2];
    } else {
        middle = line;
    }

    if (middle.length)
        message.args = middle.split(/ +/);

    if (typeof(trailing) != 'undefined' && trailing.length)
        message.args.push(trailing);

    return message;
};


var entityMap = {
    "&": "&",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '/'
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}


function localize_date(date) {
    var newDate = new Date(date.getTime()+date.getTimezoneOffset()*60*1000);

    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();

    newDate.setHours(hours - offset);

    return newDate;
}