const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
let botTag = null;

app.get('/', (req, res) => {
  if (botTag) {
    res.send(`Bot connecté en tant que ${botTag}`);
  } else {
    res.send('Bot non connecté');
  }
});

function setBotTag(tag) {
  botTag = tag;
}

module.exports = { app, setBotTag };

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Serveur Express démarré sur le port ${port}`);
  });
}
