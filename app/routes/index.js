var express = require('express');
var router = express.Router();
var inputStr = '<p>hello</p>';

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/editor', function(req, res) {
  res.render('editor', { inputStr: inputStr });
});

router.post('/editor', function(req, res) {
  var updatedHtml = req.body.newhtml;
  inputStr = updatedHtml;
  console.log('Received HTML: ' + updatedHtml);
  res.redirect('editor');
});

router.get('/viewhtml', function(req, res) {
  res.render('html-view', { inputStr: JSON.stringify(inputStr) });
});

module.exports = router;
