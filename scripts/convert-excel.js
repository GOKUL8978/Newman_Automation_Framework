const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Papa = require('papaparse');

const INPUT_FOLDER = './csv-converter';

const OUTPUT_FOLDER = './csv files';

const WORKSHEET_NAME = '';

if (!fs.existsSync(OUTPUT_FOLDER)) {

    fs.mkdirSync(OUTPUT_FOLDER, {
        recursive: true
    });
}

const files =
    fs.readdirSync(INPUT_FOLDER);

const excelFiles =
    files.filter(file =>
        file.endsWith('.xlsx') ||
        file.endsWith('.xls')
    );

if (excelFiles.length === 0) {

    console.log('⚠️ No Excel files found');

    process.exit(0);
}

excelFiles.forEach(file => {

    try {

        const excelPath =
            path.join(INPUT_FOLDER, file);

        const workbook =
            XLSX.readFile(excelPath);

        let worksheetName =
            WORKSHEET_NAME;

        if (
            !worksheetName ||
            !workbook.SheetNames.includes(
                worksheetName
            )
        ) {

            worksheetName =
                workbook.SheetNames[0];
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

        const csvFile =
            file.replace(
                /\.(xlsx|xls)$/i,
                '.csv'
            );

        const csvPath =
            path.join(
                OUTPUT_FOLDER,
                csvFile
            );

        fs.writeFileSync(
            csvPath,
            csvData
        );

        fs.unlinkSync(excelPath);

        console.log(`✅ Converted: ${file}`);

    } catch (err) {

        console.log(`❌ Failed: ${file}`);

        console.log(err.message);
    }
});

console.log('🎉 Conversion Completed');