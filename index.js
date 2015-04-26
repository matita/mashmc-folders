var fs = require('fs');
var path = require('path');
var titleCase = require('title-case');
var walker = require('./utils/lazywalker.js');


module.exports = function(mashmc, route) {
  var me = this;
  var config;
  var db = mashmc.db;

  // add unique index
  db.ensureIndex({ fieldName: 'filepath', unique: true }, function (err) { });

  // read config
  fs.readFile(path.resolve(__dirname, 'config.json'), function(err, data) {
    if (err)
      return console.error('error reading config.json', err);
    config = JSON.parse(data.toString());
    config.folders.forEach(me.addFolder);
  });

  
  me.addFolder = function(folder) {
    console.log('added folder:', folder);
    var w = walker(folder)
      .on('file', onFileFound)
      .on('error', function(err) { console.error(err); })
      .on('end', function() { console.log('finished walking', folder); });
  }


  function onFileFound(filepath, fstat) {
    db.findOne({ filepath: filepath }, function(err, doc) {
        if (!doc) {
          var media = parseTitle(filepath); //serializeFile(filepath);
          if (isValid(media))
            db.insert(media, function(err, newDoc) {
              if (err)
                return console.error('error inserting', media.title, err);
              console.log('inserted:', newDoc.title);
            })
        } else {
          console.warn('skipped:', path.basename(filepath));
        }
      });
  }


  function isValid(media) {
    return media.type !== 'unknown' &&
      !media.title.match(/\bsample\b/i) &&
      !media.title.match(/\btrailer\b/i);
  }
}


function serializeFile(filepath) {
  var ext = path.extname(filepath);
  var basename = path.basename(filepath, ext);

  return {
    category: 'media',
    type: getType(ext),
    title: basename,
    filepath: filepath,
    ext: ext
  };
}







function parseTitle(filepath) {
  var meta = {};
  // here?
  meta.category = 'media';
  meta.filepath = filepath;
  meta.ext = path.extname(filepath).replace('.', '');
  meta.filename = path.basename(filepath, '.' + meta.ext);
  meta.title = meta.filename;

  switch (meta.ext) {
    case 'avi':
    case 'flv':
    case 'mkv':
    case 'mov':
    case 'mp4':
    case 'mpg':
    case 'mpeg':
    case 'm4v':
    case 'wmv':
      parseVideoTitle(meta);
      break;
    case 'mp3':
    case 'wav':
      parseAudioTitle(meta);
      break;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
      parseImageTitle(meta);
      break;
  }

  return meta;
}


function parseVideoTitle(meta) {
  meta.type = 'video';

  var title = meta.title;
  // remove language
  title = title.replace(/\b(ita(lian)?|eng|jpn)\b/gi, '');
  // remove codec
  title = title.replace(/\b(x\.?26[45]|h\.?26[45]|xvid|divx|mkv)\b/i, removeAndStore(meta, 'codec'));
  // remove audio
  title = title.replace(/\b((dd)?\W?5\.1(\W?dual)?|ac3(\W?dual)?|aac|(dd)?\W?2\.0|mp3|aac\W?2\.0|dts)\b/i, removeAndStore(meta, 'audio'));
  // remove quality
  title = title.replace(/\b(1080[pi]|720[pi]|540p|sub(bed)?|md|ld|sd|fullhd)\b/i, removeAndStore(meta, 'quality'));
  // remove source
  title = title.replace(/\b(hdtv(mux)?|dvdrip|dvdscr|brrip|bdrip|bluray|web-?dl(rip)?|webrip|webisodes?|sat(rip)?)\b/i, removeAndStore(meta, 'source'));
  // remove team
  title = title.replace(/\b(?:by\W?)?(pir8|p&tm|killers|asap|yify|darkside(mux)?|novarip|newzone|idn[-_\s]crew|deimos|dimension|eci|bst|t4p3|gly|astra|ubi|upz|tla|sid|mircrew|nahom|shortbrehd|ftp|river|sriz|organic|bma|mt|sneaky|bluworld|c0p|immerse|2hd|remarkable|trtd[-_\s]team|hevc|psa|marge|fum|okuto|xclusive|teampremiumcracking|rarbg|republic|winetwork-bt|ntb|hoc|evo|evolve|trl|batv|krazy\W?karvs|juggs|dss|thepiratepimp|mtx\W?group|fqm|nikkyter|itasa|qcf|kyr|excellence|wozzup|theking|fov|rekram|4yeo|darkman|horizon|artsubs|shiv@|playnow|lol|rev|v3ndetta|pure\Wrg|free|gaz|playxd|axxo|alex4|xd2v)\b/i, removeAndStore(meta, 'team'));
  // remove unknown stuff
  title = title.replace(/\b(fft|ffa|repack|rip|tvu\.org\.ru|miniserie\Wtv|tutankemule\.net|proper|bokutox|limited|anime)\b/i, '');
  // remove year
  title = title.replace(/\b((19|20)\d\d)\b/, removeAndStore(meta, 'year'));
  // remove useless characters
  title = title.split(/[^a-z0-9ÀÁÂÄÇÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜàáâäçèéêëîïôöûü\']+/i).join(' ').replace(/\s+/, ' ').replace(/^\s+/, '').replace(/\s+$/, '');
  // check series-episode
  title = title.replace(/s?(\d+)\s*[ex](\d+)/i, function(match, season, episode) {
    meta.season = +season;
    meta.episode = +episode;
    return '--split--';
  });
  title = title.split('--split--')[0];

  title = titleCase(title);

  if (meta.hasOwnProperty('season')) {
    if (!title) {
      // get series title from the containing folder
      var dirname = path.basename(path.dirname(meta.filepath));
      title = parseVideoTitle({ title: dirname }).title;
      title = title.replace(/\s*\d+x\d+\s*/, '');
    }

    meta.series = title;
    title += ' ' + meta.season + 'x' + padNumber(meta.episode, 2);
  }

  meta.title = title;
  return meta;
}


function padNumber(num, pad) {
  var str = '' + num;
  while (str.length < pad)
    str = '0' + str;
  return str;
}


function removeAndStore(meta, property) {
  return function(match, value) {
    //console.log(property, value);
    meta[property] = value;
    return '';
  }
}


function parseAudioTitle(meta) {
  meta.type = 'audio';
}


function parseImageTitle(meta) {
  meta.type = 'image';
}