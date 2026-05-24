const fs = require('fs');

function readProperties(filePath) {

    const content =
        fs.readFileSync(filePath, 'utf8');

    const lines =
        content.split('\n');

    const properties = {};

    lines.forEach(line => {

        line = line.trim();

        if (
            !line ||
            line.startsWith('#')
        ) {
            return;
        }

        const index =
            line.indexOf('=');

        if (index === -1) {
            return;
        }

        const key =
            line.substring(0, index).trim();

        const value =
            line.substring(index + 1).trim();

        properties[key] = value;
    });

    return properties;
}

module.exports = readProperties;