var net = Npm.require('net');

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
        stripColors: (params && params.stripColors) || true
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
    self.connection = net.createConnection(self.options.port, self.options.server, function() {
        if (self.config.debug) console.log('connecting...');
    });
    this.connection.setEncoding('utf8');

    this.connection.addListener('connect', function() {
        self.send('NICK', self.config.nick);
        self.send('USER', self.config.username, 8, "*", self.config.realname);

        self.send('CAP', 'REQ', 'znc.in/server-time-iso');

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
        lines.forEach(function(dirtyLine) {
            var line = self.parseLine(dirtyLine);

            //if (dirtyLine.indexOf("353") != -1)
                //console.log(line)

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
                    var text = line.args[1];
                    var action = false;
                    if (text.substring(1, 7) === 'ACTION') {
                        var text = text.substring(8);
                        action = true;
                    }
                    var date;
                    if ("server_time" in line)
                        date = line.server_time;

                    if (text.indexOf(self.config.nick) !== -1) {
                        console.log("mentioned!")
                        serverMessages.notify('serverMessage:ping', "You were mentioned in " + channel, text);
                    }

                    addMessageToDb(self, channel, handle, text, action, date);

                    if (self.channels.indexOf(channel) === -1) {
                        self.channels.push(channel);
                        IRCChannels.insert({
                            channel: channel,
                            server: self.config.server_id,
                            sortChannel: channel.toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
                            user: self.config.user,
                        });
                    }

                    var isLink = text.match(/(https?|ftp):\/\/(([a-z0-9$_\.\+!\*\\(\),;\?&=-]|%[0-9a-f]{2})+(:([a-z0-9$_\.\+!\*\'\(\),;\?&=-]|%[0-9a-f]{2})+)?@)?((([a-z0-9]\.|[a-z0-9][a-z0-9-]*[a-z0-9]\.)*[a-z][a-z0-9-]*[a-z0-9]|((\d|[1-9]\d|1\d{2}|2[0-4][0-9]|25[0-5])\.){3}(\d|[1-9]\d|1\d{2}|2[0-4][0-9]|25[0-5]))(:\d+)?)(((\/+([a-z0-9$_\.\+!\*\'\(\),;:@&=-]|%[0-9a-f]{2})*)*(\?([a-z0-9$_\.\+!\*\'\(\),;:@&=-]|%[0-9a-f]{2})*)?)?)?(#([a-z0-9$_\.\+!\*\'\(\),;:@&=-]|%[0-9a-f]{2})*)?/i);
                    if (isLink != null) {
                        IRCLinks.insert({
                            url: isLink[0],
                            channel: channel,
                            ts: +new Date
                        });
                    }
                    break;
                case "QUIT":
                    if (self.config.debug) console.log("QUIT: " + line.prefix + " " + line.args.join(" "));
                case "PART":
                    addMessageToDb(self, line.args[0], "", line.prefix + " left the channel!", true);
                    break;
                case "JOIN":
                    addMessageToDb(self, line.args[0], "", line.prefix + " joined the channel!", true);
                    break;
                case "NICK":
                    // TODO: handle nick changes
                    // DEPENDS ON LIST OF USERS
                    break;
                default:
                    if (self.config.debug) console.log(line.command + ": " + line.prefix + " " + line.args.join(" "));
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

    function addMessageToDb(self, chan, user, message, action, date) {
        if (date === undefined) {
            date = new Date();
        }

        date = date || new Date();

        var currentTime = "";
        var hours = date.getHours();
        var minutes = date.getMinutes();

        if (minutes < 10) {
            minutes = "0" + minutes
        }

        currentTime += hours + ":" + minutes;

        //insert irc message into db
        IRCMessages.insert({
            handle: user,
            channel: chan,
            server: self.config.server_id,
            text: message,
            date_time: date,
            time: currentTime,
            action: action,
            user: self.config.user,
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
IRC.prototype.join = function(channel) {
    if (this.connection) {
        this.send.apply(this, ['JOIN'].concat(channel));
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
        if (this.config.debug) console.log(args);
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
        channel: channel,
        text: message,
        date_time: date,
        time: currentTime,
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
        channel: channel,
        text: message.replace("/me ", ""),
        date_time: date,
        time: currentTime,
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
    var message = msg || 'Powered by Meteor-IRC http://github.com/Pent/meteor-irc';
    this.send("QUIT", message);
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
