import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Leer .env
const envFile = fs.readFileSync('.env', 'utf8');
let url = '';
let key = '';
envFile.split('\n').forEach(line => {
  if(line.startsWith('PUBLIC_SUPABASE_URL')) url = line.split('=')[1].replace(/"/g, '').trim();
  if(line.startsWith('PUBLIC_SUPABASE_ANON_KEY')) key = line.split('=')[1].replace(/"/g, '').trim();
});

const supabase = createClient(url, key);

async function createAdmins() {
  const users = [
    'german@goestrategiacreativa.com', 
    'nestor@goestrategiacreativa.com'
  ];
  
  const password = 'ClockAdmin2026!';

  console.log('Creando usuarios admin...');
  for (const email of users) {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    
    if (error) {
      console.error(`Error creando ${email}:`, error.message);
    } else {
      console.log(`✅ Usuario creado: ${email}`);
    }
  }
  console.log(`\nLa contraseña temporal para ambos es: ${password}`);
}

createAdmins();
