var finder = require('findit')(process.argv[2] || '.'),
    path = require('path'),
    Citation = require('citation'),
    _ = require('lodash'),
    fs = require('fs');

var body_template = _.template(fs.readFileSync('templates/section._'));

finder.on('directory', ondirectory)
    .on('file', onfile);

function ondirectory(dir, stat, stop) {
    var base = path.basename(dir);
    if (base === '.git' || base === 'node_modules') stop();
}

function onfile(file, stat) {
    // run a specific file by putting it on the command line
    if (process.argv.length > 3 && !file.match(process.argv[3])) return;

    if (file.match(/json$/)) {
        console.log(file);

        var f = JSON.parse(fs.readFileSync(file));
        if (!f.level) return;

        // Map xs:include's to their JSON data.
        var children = f.level['ns0:include'];
        if (Array.isArray(children)) {
            children = children.map(function(x) { return {
                filename: x["@href"].replace(".xml", ".html"),
                title: make_page_title(JSON.parse(fs.readFileSync(path.dirname(file) + "/" + x["@href"].replace(".xml", ".json"))))
            }; });
        }

        if (f.level.level && !Array.isArray(f.level.level)) {
            f.level.level = [f.level.level];
        }
        if (f.level.text && !Array.isArray(f.level.text)) {
            f.level.text = [f.level.text];
        }
        if (!f.level.text) f.level.text = [];

        fs.writeFileSync(file.replace('json', 'html'),
            body_template({
                d: f,
                cited: cited,
                title: make_page_title(f),
                children: children,
                is_index_file: file.match(/index.json$/)
            }));
    }
}

function make_page_title(obj) {
    var level = obj.level;

    var title = null;

    if (level.type == "Section") {
        title = "§" + level.num;

    } else if (level.type == "placeholder") {
        title = "[";

        if (level.section)
            title += "§" + level.num;
        else if (level["section-range-type"] == "range")
            title += "§" + level["section-start"] + "-§" + level["section-end"];
        else if (level["section-range-type"] == "list")
            title += "§" + level["section-start"] + ", §" + level["section-end"];

        if (level.reason)
            title += " (" + level.reason + ")";

        title += "]";

    } else {
        // Division, Title, Part, etc.
        title = level.type + " " + level.num;
    }

    if (title && level.heading)
        title += ": " + level.heading;
    else if (!title && level.heading)
        title = level.heading;

    return title;
}

function cited(text) {
    var c = Citation.find(text, {
        context: {
            dc_code: {
                source: 'dc_code'
            }
        },
        excerpt: 40,
        types: ['dc_code', 'dc_register', 'law', 'stat'],
        replace: {
            dc_code: codeCited,
            law: lawCited,
            dc_register: dcrCited,
            stat: statCited
        }
    }).text;

    return c;

    function linked(url, text) {
        return "<a href='" + url + "'>" + text + "</a>";
    }

    function statCited(cite) {
        if (parseInt(cite.stat.volume, 10) < 65)
            return;

        return linked('http://api.fdsys.gov/link?collection=statute&volume=' + cite.stat.volume + '&page=' + cite.stat.page,
            cite.match);
    }

    // is this a current DC Code cite (something we should cross-link),
    // or is it to a prior version of the DC Code?
    function codeCited(cite) {
        var index = cite.excerpt.search(/ior\s+codifications\s+1981\s+Ed\.?\,?/i);
        if (index > 0 && index < 40) // found, and to the left of the cite
            return;

        return linked("./" + cite.dc_code.title + "-" + cite.dc_code.section + '.html',
            cite.match);
    }

    function lawCited(cite) {
        var lawName = cite.law.type + " law " + cite.law.congress + "-" + cite.law.number;
        var url = 'http://www.govtrack.us/search?q=' + encodeURIComponent(lawName);
        return linked(url, cite.match);
    }

    // just link to that year's copy on the DC Register website
    function dcrCited(cite) {
        if (parseInt(cite.dc_register.volume, 10) < 57)
            return;

        var year = parseInt(cite.dc_register.volume, 10) + 1953;
        return linked('http://www.dcregs.dc.gov/Gateway/IssueList.aspx?IssueYear=' + year,
            cite.match);
    }
}
