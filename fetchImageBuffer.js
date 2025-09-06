const fetch = require('node-fetch');

async function fetchImageBuffer(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Startoto1007 at Hypebot (+https://hypebot-discord.netlify.app/; startoto1007@gmail.com)'
    }
  });
  if (!response.ok) throw new Error('Erreur lors du téléchargement de l\'image');
  return await response.buffer();
}

module.exports = fetchImageBuffer;
