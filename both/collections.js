/* global IRCMessages */
/* global IRCChannels */
/* global IRCUsers */
/* global IRCConnections */
/* global IRCServers */
/* global IRCLinks */
/* global IRCPings */
/* global serverMessages */

// databases
IRCMessages = new Mongo.Collection('ircMessages');

IRCChannels = new Mongo.Collection('ircChannels');
IRCUsers = new Mongo.Collection('ircUsers');
IRCConnections = new Mongo.Collection('ircConnections');
IRCServers = new Mongo.Collection('ircServers');
IRCLinks = new Mongo.Collection('ircLinks');

IRCPings = new Mongo.Collection('ircPings');


serverMessages = new ServerMessages();

