var net = Npm.require('net');
var tls = Npm.require('tls');

/**
 * IRC Constructor
 *
 * Creates the IRC instance
 * @param params optional preferences for the connection
 */
IRC = class IRC {
    constructor(params) {
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
            debug: false,
            user: (params && params.user) || 0,
            server_id: (params && params.server_id) || "",
            stripColors: (params && params.stripColors) || true,
            znc: (params && params.znc) || false,
            ssl: (params && params.ssl) || false
        };
        this.channels = [];
    }

    connect() {
        try {
            // socket opts
            var connectionOptions = {
                host: this.options.server,
                port: this.options.port,
                rejectUnauthorized: false
            };

            if (this.config.ssl) {
                console.log('connecting vis ssl');
                this.connection = tls.connect(connectionOptions, function () {
                    // callback called only after successful socket connection
                    this.connection.connected = true;
                    this.connection.setEncoding('utf8');

                    this.send('NICK', this.config.nick);
                    this.send('USER', this.config.username, 8, "*", this.config.realname);

                    this.send('CAP', 'LS');
                    this.send('CAP', 'REQ', 'znc.in/server-time-iso');
                    this.send('CAP', 'END');

                    if (this.config.password !== "")
                        this.send('PASS', this.config.password);

                    _.each(this.config.channels, function (channel) {
                        this.send('JOIN', channel);
                    });
                });
            } else {
                this.connection = net.createConnection(this.options.port, this.options.server, () => {
                    if (this.config.debug) console.log('connecting...');
                });
            }

            this.connection.on('error', Meteor.bindEnvironment(function (err) {
                console.log("Error: " + err);
                console.log("Error caught! NOT Exiting...");
                IRCConnections.remove({_id: this.config.server_id});
                IRCUsers.remove({server: this.config.server_id});
                IRCChannels.remove({server: this.config.server_id});

                serverMessages.notify('serverMessage:' + this.config.user, "Connection error!", err.toString());
            }));

            this.connection.addListener('connect', () => {
                this.send('NICK', this.config.nick);
                this.send('USER', this.config.username, 8, "*", this.config.realname);

                if (this.config.znc) {
                    this.send('CAP', 'LS');
                    this.send('CAP', 'REQ', 'znc.in/server-time-iso');
                    this.send('CAP', 'END');
                }

                if (this.config.password !== "")
                    this.send('PASS', this.config.password);

                _.each(this.config.channels, function (channel) {
                    this.send('JOIN', channel);
                });
            });

            //wrap in a meteor environment in order to use x.insert()
            //fixme: on motd, identify with nickserv
            this.connection.addListener('data', Meteor.bindEnvironment((chunk) => this.handleLine(chunk)), function (e) {
                Meteor._debug("Exception from connection close callback:", e);
            });

            this.connection.addListener('drain', function () {
                this.buffer = '';
            });

            this.connection.addListener('close', () => {
                if (this.config.debug) console.log('disconnected');
            })


        } catch (e) {
            console.log(e);
            this.disconnect("An error occurred in this irc client, bailing!");

            IRCConnections.remove({server: this.config.server_id});
            IRCUsers.remove({server: this.config.server_id});
            IRCChannels.remove({server: this.config.server_id});

        }
    }

    handleLine(chunk) {
        this.buffer += chunk;
        var lines = this.buffer.split("\r\n");
        this.buffer = lines.pop();
        //console.log(lines);
        lines.forEach((dirtyLine) => {
            var line = this.parseLine(dirtyLine);

            switch (line.command) {
                case "PING":
                    this.send("PONG", line.args[0]);
                    break;
                case "VERSION":
                    this.send("METEOR-IRC 1.0", line.args[0]);
                    break;
                case "NOTICE":
                    var nick = line.nick ? line.nick.toLowerCase() : '';
                    var text = line.args[1] ? line.args[1].toLowerCase() : '';
                    if (nick === 'nickserv') {
                        if (text.indexOf('registered') != -1) {
                            this.say('nickserv', 'IDENTIFY ' + this.config.password);
                        } else if (text.indexOf('invalid') != -1) {
                            this.nick(this.config.nick + Math.floor(Math.random() * 10));
                        }
                    }
                    break;
                case "PRIVMSG":
                    var handle = line.nick;
                    var channel = line.args[0];

                    if (line.args[0] == this.config.nick) {
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

                    var highlighted = text.indexOf(this.config.nick) !== -1;
                    if (highlighted) {
                        console.log("mentioned!")
                        serverMessages.notify('serverMessage:' + this.config.user, "You were mentioned in " + channel + " by " + handle, text);

                        IRCPings.insert({
                            handle: handle,
                            channel: channel,
                            server: this.config.server_id,
                            text: escapeHtml(text),
                            date_time: date || new Date(),
                            action: action,
                            user: this.config.user
                        });
                    }

                    this.addMessageToDb(channel, handle, text, action, date, highlighted);

                    if (this.channels.indexOf(channel) === -1) {
                        this.channels.push(channel);
                        IRCChannels.insert({
                            channel: channel,
                            server: this.config.server_id,
                            sortChannel: channel.toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                            user: this.config.user
                        });
                    }

                    break;
                case "QUIT":
                    // TODO
                    break;
                case "PART":
                    this.addMessageToDb(line.args[0], "", line.prefix + " left the channel!", true);

                    if (this.channels.indexOf(line.args[0]) === -1) {
                        this.channels.push(line.args[0]);
                        IRCChannels.insert({
                            channel: line.args[0],
                            server: this.config.server_id,
                            sortChannel: line.args[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                            user: this.config.user,
                        });
                    }

                    break;
                case "JOIN":
                    this.addMessageToDb(this, line.args[0], "", line.prefix + " joined the channel!", true);

                    if (this.channels.indexOf(line.args[0]) === -1) {
                        this.channels.push(line.args[0]);
                        IRCChannels.insert({
                            channel: line.args[0],
                            server: this.config.server_id,
                            sortChannel: line.args[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                            user: this.config.user,
                        });
                    }

                    break;
                case "353":
                    if (line.args[0] !== this.config.nick)
                        this.config.nick = line.args[0];

                    var userList = line.args[3].split(" ");

                    //var addUsers = function (userList) {
                    Meteor.defer(function () {
                            userList.forEach(function (s) {
                                var user_sorting = s.toLowerCase().replace("@", "").replace("+", "");
                                var user_norank = s.replace("@", "").replace("+", "");
                                IRCUsers.insert({
                                    channel: line.args[2],
                                    server: this.config.server_id,
                                    ircuser: s,
                                    ircuser_norank: user_norank,
                                    ircuser_sorting: user_sorting,
                                    user: this.config.user,
                                });
                            })
                        }
                    );

                    //var addUsersAsync = Meteor.wrapAsync(addUsers);
                    //addUsersAsync(userList);

                    break;
                case "332":
                    addMessageToDb(line.args[1], "Channel Topic: ", line.args[2], true);
                    break;
                case "NICK":
                    // TODO: handle nick changes
                    // DEPENDS ON LIST OF USERS
                    break;
                case "433":
                    this.send('NICK', this.config.nick + "_");
                    this.send('USER', this.config.username, 8, "*", this.config.realname);

                    if (this.config.znc) {
                        this.send('CAP', 'LS');
                        this.send('CAP', 'REQ', 'znc.in/server-time-iso');
                        this.send('CAP', 'END');
                    }

                    if (this.config.password !== "")
                        this.send('PASS', this.config.password);

                    break;
                default:
                    break;
            }
        });
    }

    addMessageToDb(chan, user, message, action, date, highlighted) {
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

        if (user === this.config.nick) {
            cssClass.push("this");
        }

        //insert irc message into db
        IRCMessages.insert({
            handle: user,
            channel: chan,
            server: this.config.server_id,
            text: escapeHtml(message),
            css: cssClass.join(" "),
            date_time: date.toString(),
            date_sort: date,
            time: "",
            action: action,
            user: this.config.user,
            irc: true,
            bot: false
        });
    }
};


/**
 *join
 *
 * sends a join command to the irc server
 * @param channel to join
 */
IRC.prototype.join = function (channel) {
    if (this.connection) {
        this.channels.push(channel);
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
IRC.prototype.part = function (channel) {
    if (this.connection) {
        this.channels.pop(channel);
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
IRC.prototype.nick = function (nickname) {
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
IRC.prototype.send = function (command) {
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
IRC.prototype.say = function (channel, message) {
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

IRC.prototype.action = function (channel, message) {
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
IRC.prototype.disconnect = function (msg) {
    var message = msg || 'Powered by Comet-IRC https://github.com/rymate1234/Comet-IRC';
    this.send("QUIT", message);

    IRCConnections.remove({_id: this.config.server_id});
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
IRC.prototype.parseLine = function (line) {
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
    var newDate = new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);

    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();

    newDate.setHours(hours - offset);

    return newDate;
}
