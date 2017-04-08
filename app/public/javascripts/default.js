$(document).ready(function() {
  var code = $(".codemirror-textarea")[0];
  var editor = CodeMirror.fromTextArea(code, {
    lineNumbers: true
  });
  editor.on("change", function(instance, changeObj) {
    console.log(changeObj.text);
  });
});
