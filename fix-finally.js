const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

// Fix the malformed finally block that has extra lines
const bad = `    } finally {\n        loadingState.classList.add('hidden');\n    // Hide all-models section if showing single model\n    const allSection = document.getElementById('allModelsSection');\n    if (allSection) allSection.classList.add('hidden');\n}\n    }\n}`;
const good = `    } finally {\n        loadingState.classList.add('hidden');\n    }\n}`;

if (c.includes(bad.split('\n')[2])) {
    // Find and fix the finally block
    c = c.replace(/\} finally \{[^}]*loadingState\.classList\.add\('hidden'\);[\s\S]*?\}\n    \}\n\}/m, 
        `    } finally {\n        loadingState.classList.add('hidden');\n    }\n}`);
    fs.writeFileSync('app.js', c);
    console.log('Fixed! Lines around finally:');
    const lines = c.split('\n');
    const idx = lines.findIndex(l => l.includes('} finally {'));
    lines.slice(idx, idx + 6).forEach((l,i) => console.log(idx+i+1, ':', l));
} else {
    console.log('Pattern not found, showing lines 62-74:');
    c.split('\n').slice(61, 74).forEach((l,i) => console.log(i+62,':', l));
}
