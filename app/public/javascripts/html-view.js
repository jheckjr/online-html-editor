function loadHtml(input) {
  var $viewDiv = $("#viewDiv");
  var html = $.parseHTML(input);

  $viewDiv.append(html);
}
