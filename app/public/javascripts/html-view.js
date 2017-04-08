function loadHtml(input) {
  var $viewDiv = $("#viewDiv");
  var htmlStrTest = "<p>This is HTML</p>";
  var html = $.parseHTML(input);

  $viewDiv.append(html);
}
