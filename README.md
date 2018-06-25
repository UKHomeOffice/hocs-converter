# hocs-converter

DOCX to PDF microservice powered by [unoconv](https://github.com/dagwieers/unoconv).

POST /api

```
Encoding type: multipart/form-data

Parameters:
  - file: document.pdf

returns: application/pdf
```

GET /health

```
returns: 200
```

Configuration: 

```
MAX_FILESIZE: maximum filesize in bytes
SUPPORTED_TYPES: csv whitelist of filetypes e.g. 'doc, docx...'
CONVERTER_TIMEOUT: request timeout in ms
CLAMAV_HOST: host of clamd instance (if omitted, disables virus scanning)
CLAMAV_POST: port of clamd instance (default 3310)
```
.
