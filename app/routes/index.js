var express = require('express');
var router = express.Router();
var inputStr = 'hello';

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/editor', function(req, res) {
  res.render('editor', { inputStr: inputStr });
});

router.post('/updatehtml', function(req, res) {
  var updatedHtml = req.body.newhtml;
  inputStr = updatedHtml;
  console.log("Received HTML:" + updatedHtml);
  res.redirect("editor");
});

module.exports = router;
