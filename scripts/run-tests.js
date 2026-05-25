// ======================================
// scripts/run-tests.js
// FINAL ENTERPRISE VERSION
// ======================================

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
// GET CURRENT FOLDER CONFIG
// ======================================

let currentFolderConfig = null;

if (
    targetFolder &&
    folderCsvMap[targetFolder]
) {

    currentFolderConfig =
        getFileConfig(
            folderCsvMap,
            targetFolder
        );

} else if (
    folderCsvMap['ROOT']
) {

    currentFolderConfig =
        getFileConfig(
            folderCsvMap,
            'ROOT'
        );
}

// ======================================
// INPUT FILE
// ======================================

let inputFile = null;

if (currentFolderConfig) {

    inputFile =
        currentFolderConfig.file;
}

// ======================================
// READ EXCEL DATA
// ======================================

function readExcelData(
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

    return XLSX.utils.sheet_to_json(
        worksheet,
        {
            defval: '',
            raw: false
        }
    );
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
// INPUT DATA
// ======================================

if (inputFile) {

    if (
        inputFile.endsWith('.xlsx')
    ) {

        const worksheet =
            currentFolderConfig?.worksheet;

        newmanOptions.iterationData =
            readExcelData(
                inputFile,
                worksheet
            );

        console.log(
            `📘 Using Excel File: ${inputFile}`
        );

    } else {

        newmanOptions.iterationData =
            inputFile;

        console.log(
            `📄 Using CSV File: ${inputFile}`
        );
    }

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

    // ======================================
    // SKIP OTHER FOLDERS
    // ======================================

    if (
        targetFolder &&
        folderName !== targetFolder &&
        requestName !== targetFolder
    ) {

        return;
    }

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

        // ======================================
        // SUPPORT API NAME + FOLDER NAME
        // ======================================

        const storeKey =
            targetFolder === requestName
                ? targetFolder
                : folderName;

        if (!responseStore[storeKey]) {

            responseStore[storeKey] = [];
        }

        if (
            !responseStore[storeKey][iteration]
        ) {

            responseStore[storeKey][iteration] = {};
        }

        responseStore[storeKey][iteration]
            .requestBody =
            requestBody;

        responseStore[storeKey][iteration]
            .responseBody =
            responseBody;

        responseStore[storeKey][iteration]
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
                        [storeKey]
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

            // ======================================
            // SKIP OTHER FOLDERS
            // ======================================

            if (
                targetFolder &&
                folderName !== targetFolder &&
                requestName !== targetFolder
            ) {

                return;
            }

            const i =
                exec.cursor.iteration;

            const passed =
                exec.assertions?.every(
                    a => !a.error
                ) ?? true;

            // ======================================
            // SUPPORT API NAME + FOLDER NAME
            // ======================================

            const storeKey =
                targetFolder === requestName
                    ? targetFolder
                    : folderName;

            if (!resultStore[storeKey]) {

                resultStore[storeKey] = [];
            }

            resultStore[storeKey][i] =
                passed
                    ? 'PASSED'
                    : 'FAILED';
        });

    // ======================================
    // UPDATE DATA FILE
    // ======================================

    if (
        currentFolderConfig &&
        inputFile
    ) {

        await updateDataFile(
            inputFile,
            responseStore[targetFolder] || [],
            resultStore[targetFolder] || [],
            currentFolderConfig
        );
    }

    console.log('\n🎉 Execution Completed');
});

// ======================================
// UPDATE DATA FILE
// ======================================

function updateDataFile(
    filePath,
    responseData,
    results,
    config
) {

    return new Promise(resolve => {

        // ======================================
        // EXCEL FILE
        // ======================================

        if (
            filePath.endsWith('.xlsx')
        ) {

            const workbook =
                XLSX.readFile(filePath);

            const worksheetName =
                config.worksheet &&
                workbook.SheetNames.includes(
                    config.worksheet
                )
                    ? config.worksheet
                    : workbook.SheetNames[0];

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

            jsonData.forEach((row, i) => {

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

            const updatedWorksheet =
                XLSX.utils.json_to_sheet(
                    jsonData
                );

            workbook.Sheets[worksheetName] =
                updatedWorksheet;

            XLSX.writeFile(
                workbook,
                filePath
            );

            console.log(
                `📘 Updated Excel: ${filePath}`
            );

        }

        // ======================================
        // CSV FILE
        // ======================================

        else {

            fs.readFile(
                filePath,
                'utf8',
                (err, data) => {

                    if (err) {

                        console.log(
                            `❌ Unable to read: ${filePath}`
                        );

                        return resolve();
                    }

                    const parsed =
                        Papa.parse(data, {
                            header: true,
                            skipEmptyLines: true
                        });

                    parsed.data.forEach((row, i) => {

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
                        Papa.unparse(
                            parsed.data
                        );

                    fs.writeFileSync(
                        filePath,
                        updatedCsv
                    );

                    console.log(
                        `📄 Updated CSV: ${filePath}`
                    );

                    // ======================================
                    // COPY UPDATED CSV
                    // ======================================

                    const copiedReportFile =
                        `${reportFolder}/${path.basename(filePath)}`;

                    fs.copyFileSync(
                        filePath,
                        copiedReportFile
                    );

                    console.log(
                        `📄 Copied Updated CSV To Reports`
                    );

                    resolve();
                }
            );

            return;
        }

        // ======================================
        // COPY UPDATED EXCEL
        // ======================================

        const copiedReportFile =
            `${reportFolder}/${path.basename(filePath)}`;

        fs.copyFileSync(
            filePath,
            copiedReportFile
        );

        console.log(
            `📄 Copied Updated Excel To Reports`
        );

        resolve();
    });
                       }
