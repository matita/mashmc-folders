var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

module.exports = function(p) {
  return new Walker(p);
}

function Walker(p) {
  var me = this,
    queue = [p];

  step();

  function step() {
    setTimeout(dequeue);
  }

  function dequeue() {
    var p = queue.shift();

    if (!p)
      return me.emit('end');

    stat(p);
  }

  function stat(p) {
    fs.stat(p, function(err, stat) {
      if (err)
        return me.emit('error', err);

      if (stat.isDirectory()) {
        me.emit('directory', stat);
        return walk(p);
      }
      
      me.emit('file', p, stat);
      step();
    });
  }

  function walk(p) {
    fs.readdir(p, function(err, files) {
      if (err)
        return me.emit('error', err);

      files.forEach(function(file) {
        queue.push(p + path.sep + file);
      });

      step();
    });
  }
}

util.inherits(Walker, EventEmitter);