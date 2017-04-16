var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/editor', function(req, res) {
  res.render('editor', { title: 'HTML Editor' });
});

router.get('/viewhtml', function(req, res) {
  res.render('html-view', { title: 'HTML Viewer' });
});

module.exports = router;
