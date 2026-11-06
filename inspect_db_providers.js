const Database = require('better-sqlite3');
const dbPath = 'C:/Users/nminh/AppData/Roaming/omnira-studio/users/7d800667-30a8-4e8f-9c53-3b85f6c1502c/data/omnipage.db';
const db = new Database(dbPath);

const providers = db.prepare('SELECT id, provider, label, category, default_model, enabled, status FROM ai_providers').all();
console.log('Current ai_providers in DB:');
console.table(providers);

db.close();
fs.unlinkSync('inspect_db_providers.js');
