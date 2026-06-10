const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const JS_DIR = path.join(__dirname, 'public', 'js');
const OUT_FILE = path.join(JS_DIR, 'bundle.min.js');

const FILES_ORDER = [
    'api.js',
    'app.js',
    'auth.js',
    'sync.js',
    'dashboard.js',
    'test.js',
    'teacher.js',
];

async function build() {
    console.log('Сборка JS...');
    const sources = {};
    for (const file of FILES_ORDER) {
        const fp = path.join(JS_DIR, file);
        if (!fs.existsSync(fp)) {
            console.warn(`  SKIP ${file} (не найден)`);
            continue;
        }
        sources[file] = fs.readFileSync(fp, 'utf8');
        console.log(`  + ${file} (${(sources[file].length / 1024).toFixed(1)} KB)`);
    }

    const result = await minify(sources, {
        compress: {
            drop_console: false,
            passes: 2,
        },
        mangle: {
            toplevel: false,
        },
        output: {
            comments: false,
        },
        sourceMap: false,
    });

    if (result.error) {
        console.error('Ошибка минификации:', result.error);
        process.exit(1);
    }

    fs.writeFileSync(OUT_FILE, result.code, 'utf8');
    const origSize = Object.values(sources).reduce((s, c) => s + c.length, 0);
    const newSize = result.code.length;
    console.log(`\nГотово: ${OUT_FILE}`);
    console.log(`  До:    ${(origSize / 1024).toFixed(1)} KB (${FILES_ORDER.length} файлов)`);
    console.log(`  После: ${(newSize / 1024).toFixed(1)} KB (1 файл)`);
    console.log(`  Сжатие: ${(100 - newSize / origSize * 100).toFixed(0)}%`);
}

build().catch(e => { console.error(e); process.exit(1); });
