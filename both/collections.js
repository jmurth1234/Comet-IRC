// databases
IRCMessages = new Mongo.Collection('ircMessages');
IRCChannels = new Mongo.Collection('ircChannels');
IRCUsers = new Mongo.Collection('ircUsers');
IRCConnections = new Mongo.Collection('ircConnections');
IRCLinks = new Mongo.Collection('ircLinks');

serverMessages = new ServerMessages();

