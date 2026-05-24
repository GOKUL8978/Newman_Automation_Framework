const fs = require('fs');
const path = require('path');

const reportsFolder =
    path.join(__dirname, '..', 'reports');

// ======================================
// CHECK FOLDER
// ======================================

if (!fs.existsSync(reportsFolder)) {

    console.log('⚠️ reports folder not found');

    process.exit(0);
}

// ======================================
// DELETE CONTENTS ONLY
// ======================================

function deleteFolderContents(folderPath) {

    const files =
        fs.readdirSync(folderPath);

    files.forEach(file => {

        const currentPath =
            path.join(folderPath, file);

        try {

            if (
                fs.lstatSync(currentPath).isDirectory()
            ) {

                fs.rmSync(currentPath, {
                    recursive: true,
                    force: true
                });

            } else {

                fs.unlinkSync(currentPath);
            }

        } catch (err) {

            console.log(
                `❌ Unable to delete: ${currentPath}`
            );

            console.log(err.message);
        }
    });
}

// ======================================
// CLEAR REPORTS
// ======================================

try {

    deleteFolderContents(reportsFolder);

    console.log(
        '🗑️ Reports folder cleared successfully'
    );

} catch (err) {

    console.log(
        '❌ Failed to clear reports folder'
    );

    console.log(err.message);
}