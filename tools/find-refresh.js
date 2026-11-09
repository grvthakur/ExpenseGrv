const fs = require('fs');
const files = fs.readdirSync('frontend').filter(f => f.endsWith('.js'));
files.forEach(f => {
  const code = fs.readFileSync('frontend/' + f, 'utf8');
  const lines = code.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('visibilitychange') || l.includes('focus') || l.includes('reload(') || l.includes('setInterval') || l.includes('render(') || l.includes('renderCards(')) {
      if (l.includes('window') || l.includes('document') || l.includes('sync') || l.includes('location') || l.includes('Interval')) {
        console.log(`${f}:${i + 1} ${l.trim()}`);
      }
    }
  });
});
