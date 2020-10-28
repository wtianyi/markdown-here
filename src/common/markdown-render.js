/*
 * Copyright Adam Pritchard 2013
 * MIT License : http://adampritchard.mit-license.org/
 */

/*
 * The function that does the basic raw-Markdown-in-HTML to rendered-HTML
 * conversion.
 * The reason we keep this function -- specifically, the function that uses our
 * external markdown renderer (marked.js), text-from-HTML module (jsHtmlToText.js),
 * and CSS -- separate is that it allows us to keep the bulk of the rendering
 * code (and the bulk of the code in our extension) out of the content script.
 * That way, we minimize the amount of code that needs to be loaded in every page.
 */

;(function() {

"use strict";
/*global module:false*/

var MarkdownRender = {};

// Taken from https://github.com/markedjs/marked/issues/1538#issuecomment-575838181
function prepareMarkedRenderKatex(userprefs, marked) {
  var renderer = new marked.Renderer({ headerIds: userprefs['header-anchors-enabled'] });

  let i = 0
  const next_id = () => `__special_katext_id_${i++}__`
  renderer.math_expressions = {}

  function replace_math_with_ids(text) {
    // Qllowing newlines inside of `$$...$$`
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression) => {
      const id = next_id()
      renderer.math_expressions[id] = { type: 'block', expression }
      return id
    })

    // Not allowing newlines or space inside of `$...$`
    text = text.replace(/\$([^\n\s]+?)\$/g, (_match, expression) => {
      const id = next_id()
      renderer.math_expressions[id] = { type: 'inline', expression }
      return id
    })

    return text
  }

  const original_listitem = renderer.listitem
  renderer.listitem = function(text, task, checked) {
    return original_listitem(replace_math_with_ids(text), task, checked)
  }

  const original_paragraph = renderer.paragraph
  renderer.paragraph = function(text) {
    return original_paragraph(replace_math_with_ids(text))
  }

  const original_tablecell = renderer.tablecell
  renderer.tablecell = function(content, flags) {
    return original_tablecell(replace_math_with_ids(content), flags)
  }

  // Inline level, maybe unneded
  const original_text = renderer.text
  renderer.text = function(text) {
    return original_text(replace_math_with_ids(text))
  }
  return renderer;
}

/**
 Using the functionality provided by the functions htmlToText and markdownToHtml,
 render html into pretty text.
 */
function markdownRender(mdText, userprefs, marked, hljs) {
  // function mathify(mathcode) {
  //   return userprefs['math-value']
  //           .replace(/\{mathcode\}/ig, mathcode)
  //           .replace(/\{urlmathcode\}/ig, encodeURIComponent(mathcode));
  // }

  // Hook into some of Marked's renderer customizations
  if (userprefs['math-enabled']) {
    var markedRenderer = prepareMarkedRenderKatex(userprefs, marked);
  } else {
    var markedRenderer = new marked.Renderer({ headerIds: userprefs['header-anchors-enabled'] });
  }

  var sanitizeLinkForAnchor = function(text) {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
  };

  var defaultHeadingRenderer = markedRenderer.heading;
  markedRenderer.heading = function (text, level, raw) {
    if (userprefs['header-anchors-enabled']) {
      // Add an anchor right above the heading. See MDH issue #93.
      var sanitizedText = sanitizeLinkForAnchor(text);
      var anchorLink = '<a href="#" name="' + sanitizedText + '"></a>';
      return '<h' + level + '>' +
             anchorLink +
             text +
             '</h' + level + '>\n';
    }
    else {
      return defaultHeadingRenderer.call(this, text, level, raw);
    }
  };

  var defaultLinkRenderer = markedRenderer.link;
  markedRenderer.link = function(href, title, text) {
    // Added to fix MDH issue #57: MD links should automatically add scheme.
    // Note that the presence of a ':' is used to indicate a scheme, so port
    // numbers will defeat this.
    href = href.replace(/^(?!#)([^:]+)$/, 'http://$1');

    if (userprefs['header-anchors-enabled']) {
      // Add an anchor right above the heading. See MDH issue #93.
      if (href.indexOf('#') === 0) {
        href = '#' + sanitizeLinkForAnchor(href.slice(1).toLowerCase());
      }
    }

    return defaultLinkRenderer.call(this, href, title, text);
  };

  var markedOptions = {
    renderer: markedRenderer,
    gfm: true,
    pedantic: false,
    sanitize: false,
    tables: true,
    smartLists: true,
    breaks: userprefs['gfm-line-breaks-enabled'],
    smartypants: true,
    // Bit of a hack: highlight.js uses a `hljs` class to style the code block,
    // so we'll add it by sneaking it into this config field.
    langPrefix: 'hljs language-',
    // math: userprefs['math-enabled'] ? mathify : null,
    highlight: function(codeText, codeLanguage) {
        if (codeLanguage &&
            hljs.getLanguage(codeLanguage.toLowerCase())) {
          return hljs.highlight(codeLanguage.toLowerCase(), codeText).value;
        }

        return codeText;
      }
    };

  var renderedMarkdown = marked(mdText, markedOptions);

  // post-processing w/ Katex
  if (userprefs['math-enabled']) {
    renderedMarkdown = renderedMarkdown.replace(/(__special_katext_id_\d+__)/g, (_match, capture) => {
      const { type, expression } = markedRenderer.math_expressions[capture]
      return katex.renderToString(expression, { displayMode: type == 'block', output: "html" })
    })
  }

  return renderedMarkdown;
}


// Expose these functions

MarkdownRender.markdownRender = markdownRender;

var EXPORTED_SYMBOLS = ['MarkdownRender'];

if (typeof module !== 'undefined') {
  module.exports = MarkdownRender;
} else {
  this.MarkdownRender = MarkdownRender;
  this.EXPORTED_SYMBOLS = EXPORTED_SYMBOLS;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());
