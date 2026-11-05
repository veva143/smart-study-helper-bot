// Shared navbar and footer for every page
(function () {
  var pages = [["index.html","Home"],["library.html","Library"],["quiz.html","Quiz Center"],["assistant.html","AI Assistant"],["about.html","About"]];
  var here = location.pathname.split("/").pop() || "index.html";
  var links = pages.map(function (p) { return '<a href="' + p[0] + '"' + (p[0] === here ? ' class="on"' : "") + ">" + p[1] + "</a>"; }).join("");
  document.body.insertAdjacentHTML("afterbegin",
    '<header class="nav"><div class="wrap"><a class="brand" href="index.html"><span class="logo">S</span>Smart Study Helper Bot</a>' +
    '<nav class="links" id="links">' + links + '</nav><button class="burger" id="burger" aria-label="Menu">&#9776;</button></div></header>');
  document.body.insertAdjacentHTML("beforeend",
    '<footer class="ft"><div class="wrap"><div class="fg"><div><h4>Smart Study Helper Bot</h4><p>Notes, quizzes and an AI assistant for every subject. Free for all students.</p></div>' +
    '<div><h4>Explore</h4>' + links + '</div><div><h4>Project</h4><a href="about.html">About the project</a><p>BCA Summer Training 2026<br>Guide: Dr. Arti Bajaj</p></div></div>' +
    '<div class="copy">&copy; 2026 Vaibhav Verma. Made with HTML, CSS and JavaScript.</div></div></footer>');
  if(here!=="assistant.html")document.body.insertAdjacentHTML("beforeend","<a class=\"fab\" href=\"assistant.html\">💬 Ask AI</a>");
  document.getElementById("burger").onclick = function () { document.getElementById("links").classList.toggle("open"); };
})();
