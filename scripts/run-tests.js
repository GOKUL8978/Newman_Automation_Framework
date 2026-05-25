const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const newman = require('newman');
const XLSX = require('xlsx');
const yaml = require('js-yaml');

const readProperties =
    require('./properties-reader');

const {
    getValueFromPath,
    getFileConfig
} = require('./utils');

// ======================================
// LOAD FRAMEWORK CONFIG
// ======================================

const framework =
    readProperties('./config/framework.properties');

// ======================================
// INPUTS
// ======================================

const targetFolder =
    process.argv[2];

const iterationCount =
    process.argv[3];

// ======================================
// LOAD COLLECTION
// ======================================

const collectionPath =
    framework.collection;

if (!collectionPath) {

    console.log(
        '❌ Collection path missing in framework.properties'
    );

    process.exit(1);
}

const collection =
    require(path.resolve(collectionPath));

// ======================================
// LOAD MAPPING FILES
// ======================================

const mappingFile =
    framework.mappingType === 'yaml'
        ? './config/mapping.yaml'
        : './config/mapping.json';

const folderFile =
    framework.mappingType === 'yaml'
        ? './config/folderMapping.yaml'
        : './config/folderMapping.json';

// ======================================
// LOAD API FIELD MAPPING
// ======================================

const apiFieldMapping =
    framework.mappingType === 'yaml'
        ? yaml.load(
            fs.readFileSync(
                mappingFile,
                'utf8'
            )
        )
        : require('../config/mapping.json');

// ======================================
// LOAD FOLDER MAPPING
// ======================================

const folderCsvMap =
    framework.mappingType === 'yaml'
        ? yaml.load(
            fs.readFileSync(
                folderFile,
                'utf8'
            )
        )
        : require('../config/folderMapping.json');

// ======================================
// STORES
// ======================================

let responseStore = {};
let resultStore = {};
let convertedFiles = {};

// ======================================
// BUILD REQUEST → FOLDER MAP
// ======================================

function buildRequestFolderMap(
    items,
    currentFolder = null,
    map = {}
) {

    if (!Array.isArray(items)) {
        return map;
    }

    items.forEach(item => {

        if (item.item) {

            buildRequestFolderMap(
                item.item,
                item.name,
                map
            );

        } else {

            map[item.name] =
                currentFolder || 'ROOT';
        }
    });

    return map;
}

const requestFolderMap =
    buildRequestFolderMap(
        collection.item
    );

// ======================================
// REPORT FOLDER
// ======================================

const timestamp =
    new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

const reportFolder =
    `./reports/${targetFolder || 'ROOT'}_${timestamp}`;

const evidenceFolder =
    `${reportFolder}/evidence`;

fs.mkdirSync(evidenceFolder, {
    recursive: true
});

// ======================================
// INPUT FILE
// ======================================

let inputFile = null;

if (
    targetFolder &&
    getFileConfig(
        folderCsvMap,
        targetFolder
    ).file
) {

    inputFile =
        getFileConfig(
            folderCsvMap,
            targetFolder
        ).file;

} else if (
    getFileConfig(
        folderCsvMap,
        'ROOT'
    ).file
) {

    inputFile =
        getFileConfig(
            folderCsvMap,
            'ROOT'
        ).file;
}

// ======================================
// EXCEL → CSV
// ======================================

function convertExcelToCsv(
    excelPath,
    worksheetName
) {

    const workbook =
        XLSX.readFile(excelPath);

    if (
        !worksheetName ||
        !workbook.SheetNames.includes(
            worksheetName
        )
    ) {

        worksheetName =
            workbook.SheetNames[0];

        console.log(
            `📄 Using first worksheet: ${worksheetName}`
        );

    } else {

        console.log(
            `📄 Using worksheet: ${worksheetName}`
        );
    }

    const worksheet =
        workbook.Sheets[worksheetName];

    const jsonData =
        XLSX.utils.sheet_to_json(
            worksheet,
            {
                defval: '',
                raw: false
            }
        );

    const csvData =
        Papa.unparse(jsonData);

    const tempCsv =
        excelPath.replace(
            '.xlsx',
            '_temp.csv'
        );

    fs.writeFileSync(
        tempCsv,
        csvData
    );

    convertedFiles[excelPath] =
        tempCsv;

    return tempCsv;
}

// ======================================
// NEWMAN OPTIONS
// ======================================

const newmanOptions = {

    collection,

    reporters: [
        'cli',
        'htmlextra'
    ],

    reporter: {
        htmlextra: {

            export:
                `${reportFolder}/report.html`,

            title:
                `${targetFolder || 'ROOT'} Report`,

            showIterationData: true,

            logs: true,

            browserTitle:
                'Automation Report'
        }
    },

    timeout: 0,
    timeoutRequest: 0,
    timeoutScript: 0
};

// ======================================
// ITERATION COUNT
// ======================================

if (
    iterationCount !== undefined &&
    iterationCount !== null &&
    iterationCount !== '' &&
    !isNaN(iterationCount)
) {

    newmanOptions.iterationCount =
        Number(iterationCount);

    console.log(
        `🔁 Running ${iterationCount} iterations`
    );

} else {

    console.log(
        '🔁 Running ALL iterations'
    );
}

// ======================================
// FOLDER FILTER
// ======================================

if (targetFolder) {

    newmanOptions.folder =
        targetFolder;
}

// ======================================
// INPUT DATA FILE
// ======================================

if (inputFile) {

    let finalFile =
        inputFile;

    if (
        inputFile.endsWith('.xlsx')
    ) {

        const worksheet =
            getFileConfig(
                folderCsvMap,
                targetFolder
            )?.worksheet;

        finalFile =
            convertExcelToCsv(
                inputFile,
                worksheet
            );
    }

    newmanOptions.iterationData =
        finalFile;

    console.log(
        `📄 Using Data File: ${finalFile}`
    );

} else {

    console.log(
        'ℹ️ Running without data file'
    );
}

// ======================================
// SSL SUPPORT
// ======================================

if (
    framework.sslEnabled === 'true'
) {

    console.log(
        '🔐 SSL Enabled'
    );

    newmanOptions.sslClientCert =
        fs.readFileSync(
            framework.sslCert
        );

    newmanOptions.sslClientKey =
        fs.readFileSync(
            framework.sslKey
        );

    newmanOptions.sslClientPassphrase =
        framework.sslPassphrase;
}

// ======================================
// RUN NEWMAN
// ======================================

newman.run(newmanOptions)

// ======================================
// REQUEST EVENT
// ======================================

.on('request', (err, args) => {

    if (err) return;

    const requestName =
        args.item.name;

    const folderName =
        requestFolderMap[requestName]
        || 'ROOT';

    const iteration =
        args.cursor.iteration;

    const requestBody =
        args.request.body?.raw || '';

    const responseBody =
        args.response.stream.toString();

    const statusCode =
        args.response.code;

    console.log('\n================================');

    console.log(`API: ${requestName}`);

    console.log(`Iteration: ${iteration}`);

    console.log(`Status Code: ${statusCode}`);

    console.log('\nREQUEST BODY:\n');

    console.log(requestBody);

    console.log('\nRESPONSE BODY:\n');

    console.log(responseBody);

    console.log('\n================================');

    // ======================================
    // SAVE EVIDENCE FILE
    // ======================================

    const evidenceFile =
        `${evidenceFolder}/${requestName}_${iteration}.txt`;

    fs.writeFileSync(
        evidenceFile,

`REQUEST BODY:

${requestBody}

==================================================

RESPONSE BODY:

${responseBody}
`
    );

    try {

        const res =
            JSON.parse(responseBody);

        if (!responseStore[folderName]) {

            responseStore[folderName] = [];
        }

        if (
            !responseStore[folderName][iteration]
        ) {

            responseStore[folderName][iteration] = {};
        }

        let formattedRequestBody =
            requestBody;

        try {

            formattedRequestBody =
                JSON.stringify(
                    JSON.parse(requestBody)
                );

        } catch {}

        let formattedResponseBody =
            responseBody;

        try {

            formattedResponseBody =
                JSON.stringify(
                    JSON.parse(responseBody)
                );

        } catch {}

        responseStore[folderName][iteration]
            .requestBody =
            formattedRequestBody;

        responseStore[folderName][iteration]
            .responseBody =
            formattedResponseBody;

        responseStore[folderName][iteration]
            .responseStatusCode =
            statusCode;

        const mapping =
            apiFieldMapping[requestName];

        if (
            mapping &&
            mapping !== null
        ) {

            Object.keys(mapping)
                .forEach(col => {

                    responseStore
                        [folderName]
                        [iteration]
                        [col] =

                        getValueFromPath(
                            res,
                            mapping[col]
                        );
                });
        }

    } catch {

        console.log(
            `❌ Invalid JSON Response: ${requestName}`
        );
    }
})

// ======================================
// EXECUTION COMPLETE
// ======================================

.on('done', async (err, summary) => {

    if (err) {

        console.log(err);

        process.exit(1);
    }

    summary.run.executions
        .forEach(exec => {

            const requestName =
                exec.item.name;

            const folderName =
                requestFolderMap[requestName]
                || 'ROOT';

            const i =
                exec.cursor.iteration;

            const passed =
                exec.assertions?.every(
                    a => !a.error
                ) ?? true;

            if (!resultStore[folderName]) {

                resultStore[folderName] = [];
            }

            resultStore[folderName][i] =
                passed
                    ? 'PASSED'
                    : 'FAILED';
        });

    await Promise.all(

        Object.keys(folderCsvMap)
            .map(folderName => {

                const originalFile =
                    getFileConfig(
                        folderCsvMap,
                        folderName
                    )?.file;

                if (!originalFile) {

                    return Promise.resolve();
                }

                const tempCsv =
                    convertedFiles[originalFile]
                    || originalFile;

                return updateDataFile(
                    tempCsv,
                    responseStore[folderName] || [],
                    resultStore[folderName] || [],
                    originalFile,
                    folderName
                );
            })
    );

    console.log('\n🎉 Execution Completed');
});

// ======================================
// UPDATE DATA FILE
// ======================================

function updateDataFile(
    csvPath,
    responseData,
    results,
    originalFile,
    folderName
) {

    return new Promise(resolve => {

        fs.readFile(
            csvPath,
            'utf8',
            (err, data) => {

                if (err) {

                    console.log(
                        `❌ Unable to read: ${csvPath}`
                    );

                    return resolve();
                }

                const parsed =
                    Papa.parse(data, {
                        header: true,
                        skipEmptyLines: true
                    });

                const cleanData =
                    parsed.data.filter(row =>
                        Object.values(row)
                            .some(v =>
                                v !== ''
                            )
                    );

                cleanData.forEach((row, i) => {

                    row.testResult =
                        results[i] || '';

                    if (responseData[i]) {

                        Object.keys(responseData[i])
                            .forEach(key => {

                                row[key] =
                                    responseData[i][key];
                            });
                    }
                });

                const updatedCsv =
                    Papa.unparse(cleanData, {
                        quotes: true
                    });

                fs.writeFileSync(
                    csvPath,
                    updatedCsv
                );

                console.log(
                    `📄 Updated File: ${csvPath}`
                );

                // ======================================
                // UPDATE EXCEL
                // ======================================

                if (
                    originalFile.endsWith('.xlsx')
                ) {

                    const csvData =
                        Papa.parse(
                            updatedCsv,
                            {
                                header: true
                            }
                        );

                    const worksheet =
                        XLSX.utils
                            .json_to_sheet(
                                csvData.data
                            );

                    const workbook =
                        XLSX.utils
                            .book_new();

                    XLSX.utils
                        .book_append_sheet(
                            workbook,
                            worksheet,

                            getFileConfig(
                                folderCsvMap,
                                folderName
                            )?.worksheet ||

                            'Sheet1'
                        );

                    XLSX.writeFile(
                        workbook,
                        originalFile
                    );

                    console.log(
                        `📘 Updated Excel: ${originalFile}`
                    );

                    // ======================================
                    // COPY UPDATED EXCEL TO REPORTS
                    // ======================================

                    const copiedReportFile =
                        `${reportFolder}/${path.basename(originalFile)}`;

                    fs.copyFileSync(
                        originalFile,
                        copiedReportFile
                    );

                    console.log(
                        `📄 Copied Updated Excel To Reports: ${copiedReportFile}`
                    );

                } else {

                    // ======================================
                    // COPY UPDATED CSV TO REPORTS
                    // ======================================

                    const copiedReportFile =
                        `${reportFolder}/${path.basename(originalFile)}`;

                    fs.copyFileSync(
                        originalFile,
                        copiedReportFile
                    );

                    console.log(
                        `📄 Copied Updated CSV To Reports: ${copiedReportFile}`
                    );
                }

                resolve();
            }
        );
    });
}
