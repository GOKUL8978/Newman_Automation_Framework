function getValueFromPath(obj, jsonPath) {

    try {

        return jsonPath
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .reduce(
                (acc, key) =>
                    acc && acc[key],
                obj
            );

    } catch {

        return '';
    }
}

function getFileConfig(folderCsvMap, folderName) {

    const config =
        folderCsvMap[folderName];

    if (typeof config === 'string') {

        return {
            file: config,
            worksheet: ''
        };
    }

    return config || {};
}

module.exports = {
    getValueFromPath,
    getFileConfig
};