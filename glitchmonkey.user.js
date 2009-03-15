// ==UserScript==
// @name           GlitchMonkey
// @namespace      http://d.hatena.ne.jp/youpy/
// @include        *
// @require        http://www.onicos.com/staff/iz/amuse/javascript/expert/inflate.txt
// @require        http://gist.github.com/79364.txt
// ==/UserScript==

var Corruptions = {
    'image/jpeg': function() {
      return this.replace(/0/g, Math.floor(Math.random() * 10));
    },
    'image/gif': function() {
      return this.replace(/x/ig, Math.floor(Math.random() * 10));
    },
    'image/png': function() {
      return glitchPNG(this, function(data) { return data.replace(/0/g, ''); });
    }
};

Array.filter(document.images, is_glitchable).forEach(glitch);

if (window.AutoPagerize) {
  window.AutoPagerize.addFilter(function (pages) {
    pages.forEach(function (page) {
      Array.filter(page.getElementsByTagName('img'), is_glitchable).forEach(glitch);
    });
  });
}
document.addEventListener("DOMNodeInserted", function(e){
	if (!e.target.tagName) return;
	Array.filter(e.target.getElementsByTagName('img'), is_glitchable).forEach(function(el){
		// Greasemonkey access violation: unsafeWindow cannot call GM_xmlhttpRequest.
		setTimeout(function(){ glitch(el); },0);
	});
}, false);

function glitch(element) {
  GM_xmlhttpRequest({
    method: "GET",
    overrideMimeType: "text/plain; charset=x-user-defined",
    url: element.src,
    onload: function (res) {
    if (debug) console.log(res);
      var type = contentType(res.responseHeaders);
      var oldsrc = element.src;
      
      if(typeof Corruptions[type] != 'undefined') {
				element.addEventListener('error', function() {
					this.src = oldsrc;
				}, false);
				
				element.src =
					[
					 'data:',
					 type,
					 ';base64,',
					 base64encode(Corruptions[type].apply(res.responseText)),
					 ].join('');
      }
    }
  });
}

function contentType(headers) {
  return headers.match(/Content-Type: (.*)/i)[1];
}

function base64encode(data) {
  return btoa(data.replace(/[\u0100-\uffff]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) & 0xff);
  }));
}

function is_glitchable(img) {
  return img.src.match(/\.(gif|jpe?g|png)/i);
}
