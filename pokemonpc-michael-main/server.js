const http = require('http');
const url = require('url');
const querystring = require('querystring');
const crypto = require('crypto');

// In-memory storage
const users = new Map();
const pokemon = new Map();
let userIdCounter = 1;
let pokemonIdCounter = 1;

// Password utilities
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

// Body parser
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(querystring.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
};

// Templates
const templates = {
  login: (error = '') => `
    <!DOCTYPE html>
    <html>
    <head><title>Pokemon PC - Login</title></head>
    <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
      <h1>Pokemon PC Login</h1>
      ${error ? `<p style="color: red;">${error}</p>` : ''}
      <form method="POST" action="/">
        <div style="margin: 10px 0;">
          <label>Username:</label><br>
          <input type="text" name="user" required style="width: 100%; padding: 8px;">
        </div>
        <div style="margin: 10px 0;">
          <label>Password:</label><br>
          <input type="password" name="password" required style="width: 100%; padding: 8px;">
        </div>
        <button type="submit" style="width: 100%; padding: 10px; background: #007cba; color: white; border: none;">Login</button>
      </form>
      <p><a href="/signup">Sign Up</a></p>
    </body>
    </html>
  `,
  
  signup: (error = '') => `
    <!DOCTYPE html>
    <html>
    <head><title>Pokemon PC - Sign Up</title></head>
    <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
      <h1>Sign Up</h1>
      ${error ? `<p style="color: red;">${error}</p>` : ''}
      <form method="POST" action="/signup">
        <div style="margin: 10px 0;">
          <label>Username:</label><br>
          <input type="text" name="user" required style="width: 100%; padding: 8px;">
        </div>
        <div style="margin: 10px 0;">
          <label>Password:</label><br>
          <input type="password" name="password" required style="width: 100%; padding: 8px;">
        </div>
        <button type="submit" style="width: 100%; padding: 10px; background: #007cba; color: white; border: none;">Sign Up</button>
      </form>
      <p><a href="/">Back to Login</a></p>
    </body>
    </html>
  `,
  
  pc: (userID, pokemonList = [], error = '') => `
    <!DOCTYPE html>
    <html>
    <head><title>Pokemon PC</title></head>
    <body style="font-family: Arial; max-width: 800px; margin: 20px auto; padding: 20px;">
      <h1>Pokemon PC</h1>
      ${error ? `<p style="color: red;">${error}</p>` : ''}
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h2>Add New Pokemon</h2>
        <form method="POST" action="/pc">
          <input type="hidden" name="userID" value="${userID}">
          <div style="margin: 10px 0;">
            <label>Dex Number:</label><br>
            <input type="number" name="dex" required min="1" style="width: 100%; padding: 8px;">
          </div>
          <div style="margin: 10px 0;">
            <label>Name:</label><br>
            <input type="text" name="name" required style="width: 100%; padding: 8px;">
          </div>
          <div style="margin: 10px 0;">
            <label>Level:</label><br>
            <input type="number" name="level" required min="1" max="100" style="width: 100%; padding: 8px;">
          </div>
          <div style="margin: 10px 0;">
            <label>Type 1:</label><br>
            <input type="text" name="type1" required style="width: 100%; padding: 8px;">
          </div>
          <div style="margin: 10px 0;">
            <label>Type 2 (optional):</label><br>
            <input type="text" name="type2" style="width: 100%; padding: 8px;">
          </div>
          <button type="submit" style="padding: 10px 20px; background: #007cba; color: white; border: none;">Add Pokemon</button>
        </form>
      </div>

      <h2>Your Pokemon Collection</h2>
      ${pokemonList.length === 0 ? '<p>No Pokemon in your PC yet!</p>' : `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f2f2f2;">
            <th style="border: 1px solid #ddd; padding: 8px;">Dex #</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Name</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Level</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Type 1</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Type 2</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Action</th>
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
  `
};

// Server
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const { pathname, query } = parsedUrl;
    const method = req.method;

    console.log(`${method} ${pathname}`); // Debug logging

    // Routes
    if (method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(templates.login(query.error));
    }
    else if (method === 'GET' && pathname === '/signup') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(templates.signup(query.error));
    }
    else if (method === 'GET' && pathname === '/pc') {
      const userID = query.ID;
      if (!userID) {
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      const userPokemon = Array.from(pokemon.values())
        .filter(p => p.userId === parseInt(userID))
        .sort((a, b) => a.dex - b.dex);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(templates.pc(userID, userPokemon, query.error));
    }
    else if (method === 'POST' && pathname === '/') {
      const body = await parseBody(req);
      const { user, password } = body;

      const userData = users.get(user);
      if (!userData || !verifyPassword(password, userData.password)) {
        res.writeHead(302, { Location: '/?error=Invalid%20credentials' });
        res.end();
        return;
      }

      res.writeHead(302, { Location: `/pc?ID=${userData.id}` });
      res.end();
    }
    else if (method === 'POST' && pathname === '/pc') {
      const body = await parseBody(req);
      const { userID, name, level, type1, type2, dex } = body;

      if (!userID) {
        res.writeHead(302, { Location: '/?error=Login%20required' });
        res.end();
        return;
      }

      const newPokemon = {
        pid: pokemonIdCounter++,
        dex: parseInt(dex),
        name,
        level: parseInt(level),
        type1,
        type2: type2 || null,
        userId: parseInt(userID)
      };

      pokemon.set(newPokemon.pid, newPokemon);

      res.writeHead(302, { Location: `/pc?ID=${userID}` });
      res.end();
    }
    else if (method === 'POST' && pathname === '/pc/delete') {
      const body = await parseBody(req);
      const { PID, userID } = body;

      const pokemonToDelete = pokemon.get(parseInt(PID));
      if (pokemonToDelete && pokemonToDelete.userId === parseInt(userID)) {
        pokemon.delete(parseInt(PID));
      }

      res.writeHead(302, { Location: `/pc?ID=${userID}` });
      res.end();
    }
    else if (method === 'POST' && pathname === '/signup') {
      const body = await parseBody(req);
      const { user, password } = body;

      if (users.has(user)) {
        res.writeHead(302, { Location: '/signup?error=Username%20already%20exists' });
        res.end();
        return;
      }

      const hashedPassword = hashPassword(password);
      const newUser = {
        id: userIdCounter++,
        username: user,
        password: hashedPassword
      };

      users.set(user, newUser);

      res.writeHead(302, { Location: '/' });
      res.end();
    }
    else {
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