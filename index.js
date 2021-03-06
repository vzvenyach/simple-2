var basedir = process.argv[2] || '.';
var rootdir = process.argv[3] || '';

var finder = require('findit')(basedir),
    path = require('path'),
    _ = require('lodash'),
    fs = require('fs'),
    render_body = require('./render_body.js');

var page_template = _.template(fs.readFileSync('templates/section._'));

var recency_info = render_body.parse_xml_file(basedir + "/index.xml").find("meta/recency").text;

// Load pre-made indexes that help us locate the filename for any given section (by citation),
// and to locate the parent and children of any page.
var section_to_filename = JSON.parse(fs.readFileSync(basedir + '/section_index.json'));
var section_to_parent = JSON.parse(fs.readFileSync(basedir + '/section_parents_index.json'));
var section_to_children = JSON.parse(fs.readFileSync(basedir + '/section_children_index.json'));

// Recursively process the code files.
function ondirectory(dir, stat, stop) {
    var base = path.basename(dir);
    if (base === '.git' || base === 'node_modules') stop();
}
function onfile(file, stat) {
    // run a specific file by putting it on the command line
    if (process.argv.length > 4 && !file.match(process.argv[4])) return;
    if (file.match(/\.xml$/))
        convert_file(file);
}
finder.on('directory', ondirectory)
    .on('file', onfile);

// Main function to convert a code XML file to its HTML rendering.
function convert_file(file) {
    console.log(file);

    // Load the file & sanity check that this is actually a file for the DC Code.
    var dom = render_body.parse_xml_file(file);
    if (dom.tag != "level") return;

    var rendered_body = render_body.render_body(file, dom, section_to_filename, section_to_children, basedir, rootdir);

    // Find the ancestors of this file to show the navigation links to
    // go up the table of contents to higher levels.
    var ancestors = [];
    var page_id = render_body.get_file_id(dom, file, basedir);
    var parent_id = page_id;
    while (true) {
        parent_id = section_to_parent[parent_id];
        if (!parent_id) break;
        ancestors.push(make_page_link(parent_id));
    }
    ancestors.reverse();

    // Write HTML.
    fs.writeFileSync(file.replace('.xml', '.html'),
        page_template({
            rootdir: rootdir,
            ancestors: ancestors,
            sibling_previous: make_page_link(get_sibling(page_id, -1)),
            sibling_next: make_page_link(get_sibling(page_id, +1)),
            title: rendered_body.title,
            body: rendered_body.rendered,
            recency_info: recency_info
        }));
}

function make_page_link(page_id) {
    /* This is a utility function to take a page id and make an object
       with information needed to render a link to that page: href and title. */
    if (!page_id) return null;
    var file = section_to_filename[page_id];
    return {
        filename: rootdir + "/" + file +".html",
        title: render_body.make_page_title(render_body.parse_xml_file(basedir + "/" + file + ".xml"))
    };
}


function get_sibling(id, direction) {
    /* Gets the previous (direction == -1) or next (direction == 1) document
       in the Code starting at the document whose id is id.

       The preceding document is the document's preceding sibling, if it has
       one. This perhaps should be changed one day to be the preceding sibling's
       last-most decedendant. Not sure if that'll be obvious in the UI though.
        
       If the document doesn't have a preceding sibling, then the previous
       document will be its parent. If the document doesn't have a following
       sibling then the next document will be its parent's next document. */

    if (!(id in section_to_parent)) return null;

    // Get the parent document. If we're already at the root, just return null.
    var parent = section_to_parent[id];
    if (!(parent in section_to_children)) return null;

    // Look for the previous/next sibling.
    var seen_me = false;
    var sibling = null;
    section_to_children[parent].forEach(function(child_id) {
        // Looking for the first sibling after the document.
        if (seen_me && direction == 1 && !sibling)
            sibling = child_id;

        if (child_id == id) seen_me = true;

        // Looking for the last sibling before the document.
        if (!seen_me && direction == -1)
            sibling = child_id;
    });

    if (!sibling) {
        if (direction == -1)
            return parent;
        else
            return get_sibling(parent, direction);
    }
    
    return sibling;
}
