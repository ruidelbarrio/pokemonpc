const http = require('http');
const url = require('url');
const querystring = require('querystring');
const crypto = require('crypto');

// In-memory storage
const users = new Map();
const pokemon = new Map();
let userIdCounter = 1;
let pokemonIdCounter = 1;

// Utilities
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

const parseBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => resolve(querystring.parse(body)));
  req.on('error', reject);
});

const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

const renderHTML = (res, content) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
};

// Shared styles and form components
const styles = 'font-family: Arial; max-width: 800px; margin: 20px auto; padding: 20px;';
const inputStyle = 'width: 100%; padding: 8px; margin: 5px 0;';
const buttonStyle = 'padding: 10px 20px; background: #007cba; color: white; border: none;';

const renderForm = (title,  action,  fields,  error = '') => `
  <!DOCTYPE html>
  <html>
  <head><title>Pokemon PC - ${title}</title></head>
  <body style="${styles}">
    <h1 style="text-align: center;">Pokemon PC ${title}</h1>
    ${error ? `<p style="color:  red;">${error}</p>` :  ''}
    <form method="POST" action="${action}">
      ${fields.map(field => `
        <div style="margin:  10px 0;">
          <label>${field.label}</label><br>
          <input type="${field.type}" name="${field.name}" ${field.required ? 'required' :  ''} 
                 style="${inputStyle}" ${field.attrs || ''}>
        </div>
      `).join('')}
      <button type="submit" style="${buttonStyle}">${title}</button>
    </form>
    ${action === '/signup' ? '<p><a href="/">Back to Login</a></p>' :  '<p><a href="/signup">Sign Up</a></p>'}
  </body>
  </html>
`;
;

const renderPC = (userID, pokemonList = [], error = '') => `
  <!DOCTYPE html>
  <html>
  <head><title>Pokemon PC</title></head>
  <body style="${styles}">
    <h1>Pokemon PC</h1>
    ${error ? `<p style="color: red;">${error}</p>` : ''}
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
      <h2>Add New Pokemon</h2>
      <form method="POST" action="/pc">
        <input type="hidden" name="userID" value="${userID}">
        ${[
          { label: 'Dex Number:', name: 'dex', type: 'number', attrs: 'min="1"' },
          { label: 'Name:', name: 'name', type: 'text' },
          { label: 'Level:', name: 'level', type: 'number', attrs: 'min="1" max="100"' },
          { label: 'Type 1:', name: 'type1', type: 'text' },
          { label: 'Type 2 (optional):', name: 'type2', type: 'text', required: false }
        ].map(field => `
          <div style="margin: 10px 0;">
            <label>${field.label}</label><br>
            <input type="${field.type}" name="${field.name}" ${field.required !== false ? 'required' : ''} 
                   style="${inputStyle}" ${field.attrs || ''}>
          </div>
        `).join('')}
        <button type="submit" style="${buttonStyle}">Add Pokemon</button>
      </form>
    </div>

    <h2>Your Pokemon Collection</h2>
    ${pokemonList.length === 0 ? '<p>No Pokemon in your PC yet!</p>' : `
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f2f2f2;">
          ${['Dex #', 'Name', 'Level', 'Type 1', 'Type 2', 'Action'].map(header => 
            `<th style="border: 1px solid #ddd; padding: 8px;">${header}</th>`
          ).join('')}
        </tr>
        ${pokemonList.map(p => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">#${p.dex}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${p.name}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${p.level}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${p.type1}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${p.type2 || '-'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">
              <form method="POST" action="/pc/delete" style="display: inline;">
                <input type="hidden" name="PID" value="${p.pid}">
                <input type="hidden" name="userID" value="${userID}">
                <button type="submit" style="padding: 5px 10px; background: #dc3545; color: white; border: none;">Delete</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </table>
    `}
    <p><a href="/">Logout</a></p>
  </body>
  </html>
`;

// Route handlers
const routes = {
  'GET /': (req, res, query) => {
    const loginFields = [
      { label: 'Username:', name: 'user', type: 'text', required: true },
      { label: 'Password:', name: 'password', type: 'password', required: true }
    ];
    renderHTML(res, renderForm('Login', '/', loginFields, query.error));
  },

  'GET /signup': (req, res, query) => {
    const signupFields = [
      { label: 'Username:', name: 'user', type: 'text', required: true },
      { label: 'Password:', name: 'password', type: 'password', required: true }
    ];
    renderHTML(res, renderForm('Sign Up', '/signup', signupFields, query.error));
  },

  'GET /pc': (req, res, query) => {
    if (!query.ID) return redirect(res, '/');
    
    const userPokemon = Array.from(pokemon.values())
      .filter(p => p.userId === parseInt(query.ID))
      .sort((a, b) => a.dex - b.dex);

    renderHTML(res, renderPC(query.ID, userPokemon, query.error));
  },

  'POST /': async (req, res) => {
    const { user, password } = await parseBody(req);
    const userData = users.get(user);
    
    if (!userData || !verifyPassword(password, userData.password)) {
      return redirect(res, '/?error=Invalid%20credentials');
    }
    redirect(res, `/pc?ID=${userData.id}`);
  },

  'POST /signup': async (req, res) => {
    const { user, password } = await parseBody(req);
    
    if (users.has(user)) {
      return redirect(res, '/signup?error=Username%20already%20exists');
    }

    users.set(user, {
      id: userIdCounter++,
      username: user,
      password: hashPassword(password)
    });
    redirect(res, '/');
  },

  'POST /pc': async (req, res) => {
    const { userID, name, level, type1, type2, dex } = await parseBody(req);
    
    if (!userID) return redirect(res, '/?error=Login%20required');

    pokemon.set(pokemonIdCounter, {
      pid: pokemonIdCounter++,
      dex: parseInt(dex),
      name,
      level: parseInt(level),
      type1,
      type2: type2 || null,
      userId: parseInt(userID)
    });
    redirect(res, `/pc?ID=${userID}`);
  },

  'POST /pc/delete': async (req, res) => {
    const { PID, userID } = await parseBody(req);
    const pokemonToDelete = pokemon.get(parseInt(PID));
    
    if (pokemonToDelete && pokemonToDelete.userId === parseInt(userID)) {
      pokemon.delete(parseInt(PID));
    }
    redirect(res, `/pc?ID=${userID}`);
  }
};

// Server
const server = http.createServer(async (req, res) => {
  try {
    const { pathname, query } = url.parse(req.url, true);
    const routeKey = `${req.method} ${pathname}`;
    
    console.log(routeKey); // Debug logging

    const handler = routes[routeKey];
    if (handler) {
      await handler(req, res, query);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Page Not Found</h1>');
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Internal Server Error</h1><pre>${error.message}</pre>`);
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
