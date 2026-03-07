# Dilemma - Party Game

Een real-time multiplayer dilemma spel voor 2-8 spelers.

## Hoe te spelen

1. Start de server
2. Open de website
3. Maak een party aan en deel de code
4. Andere spelers joinen met de code
5. Om de beurt verzin je dilemma's, vragen, of upload je fotos
6. Iedereen stemt!

## Modi

- **Dilemma** - Kies tussen 2 lastige opties
- **Open Vraag** - Stel vragen en laat anderen antwoorden
- **Foto** - Upload 2 fotos en laat kiezen
- **Vote de Persoon** - Stel een vraag en stem op een speler

## Installatie

```bash
npm install
npm start
```

De server draait standaard op poort 3000.

## Features

- Real-time multiplayer via Socket.IO
- Sessie-herstel bij verbindingsverlies
- HTTP rate limiting (express-rate-limit)
- Socket rate limiting per verbinding
- IP connection limiting
- Stale room cleanup
- Foto upload met crop functionaliteit
- AI scheldwoord filter (optioneel, via llm7.io)
- Compressie en security headers
