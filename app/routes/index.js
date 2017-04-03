var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/editor', function(req, res) {
  res.render('editor');
});

router.post('/updatehtml', function(req, res) {
  var updatedHtml = req.body.newhtml;
  console.log("Received HTML:" + updatedHtml);
  res.redirect("editor");
});

module.exports = router;
