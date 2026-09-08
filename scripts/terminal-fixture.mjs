// Deterministic VT/input exercise. This is not a fake AI CLI or an LLM compatibility claim.
process.stdin.setRawMode(true); process.stdin.resume();
process.stdout.write('\x1b[2J\x1b[HVT PROTOCOL FIXTURE\r\n\x1b[?2004h');
process.stdout.write('Korean: 한국어 입력\r\nClear, cursor and alternate-screen isolation\r\n');
let writes = 0;
let received = '';
const timer = setInterval(() => { process.stdout.write(`\x1b[6;1HStreaming tick ${++writes}    `); }, 200);
process.stdin.on('data', bytes => {
  const text = bytes.toString();
  received = (received + text).slice(-1000);
  if (text === '\x03') { clearInterval(timer); process.stdout.write('\x1b[?2004l'); process.exit(0); }
  if (received.includes('MOUSE')) { received = ''; process.stdout.write('\x1b[?1000h\x1b[?1006h\x1b[10;1HMOUSE TRACKING ON'); }
  else if (received.includes('CLEAR')) { received = ''; process.stdout.write('\x1b[2J\x1b[HV T cleared only in the left pane\r\n'); }
  else if (received.includes('HISTORY')) { received = ''; process.stdout.write(Array.from({ length: 80 }, (_, i) => `\r\nHistory line ${i}`).join('')); }
  else process.stdout.write('\x1b[8;1HReceived: ' + JSON.stringify(text) + '    ');
});
process.stdout.on('resize', () => process.stdout.write(`\x1b[4;1HPTY size ${process.stdout.columns}x${process.stdout.rows}      `));
