const bcrypt = require('bcryptjs');

async function main() {
  const hash123456 = await bcrypt.hash('123456', 10);
  console.log('Hash for 123456:', hash123456);
}
main();

