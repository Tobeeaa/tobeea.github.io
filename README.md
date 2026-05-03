# Control-T

Web app personale per to-do, spesa e note rapide.

## Avvio locale

Serve Python 3. Non ci sono dipendenze da installare.

```bash
python app.py
```

Poi apri:

```text
http://127.0.0.1:8000
```

I dati vengono salvati in:

```text
data/casa_mia.sqlite3
```

## Nota su GitHub Pages

GitHub Pages puo' pubblicare solo file statici, quindi non puo' eseguire `app.py` e non puo' usare SQLite sul server.

Per usare questa versione con database serve un hosting Python, per esempio PythonAnywhere, Render, Railway, Fly.io o un piccolo server personale.
