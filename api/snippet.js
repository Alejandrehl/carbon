require('isomorphic-fetch')

const url = require('url')
const { json, createError, send, sendError } = require('micro')

// ~ makes the file come later alphabetically, which is how gists are sorted
const CARBON_STORAGE_KEY = '~carbon.json'

function getSnippet(req) {
  const parsed = url.parse(req.url, true)
  const id = parsed.query.id

  if (!id) {
    throw createError(401, 'id is a required parameter')
  }

  return fetch(`https://api.github.com/gists/${id}`, {
    headers: {
      Authorization: req.headers.Authorization || req.headers.authorization
    }
  })
    .then(res => res.json())
    .then(({ files, ...gist }) => {
      let config
      if (files[CARBON_STORAGE_KEY]) {
        try {
          config = JSON.parse(files[CARBON_STORAGE_KEY].content)
        } catch (error) {
          // pass
        }
      }

      const otherFiles = Object.keys(files).filter(key => key !== CARBON_STORAGE_KEY)

      const snippet = files[otherFiles[0]]

      return {
        gist: {
          ...gist,
          filename: otherFiles[0]
        },
        config: {
          ...config,
          code: snippet.content,
          language: snippet.language && snippet.language.toLowerCase()
        }
      }
    })
}

async function updateSnippet(req) {
  const parsed = url.parse(req.url, true)
  const id = parsed.query.id

  const { filename, code, ...config } = await json(req, { limit: '6mb' })

  // TODO filename's are required
  if (!id || !filename) {
    throw createError(401, 'id and filename are required body parameters')
  }

  const files = {
    [filename]: {
      content: code
    }
  }

  if (config) {
    files[CARBON_STORAGE_KEY] = {
      content: JSON.stringify(config)
    }
  }

  return fetch(`https://api.github.com/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files }),
    headers: {
      Authorization: req.headers.Authorization || req.headers.authorization
    }
  }).then(res => res.json())
}

module.exports = async function(req, res) {
  try {
    switch (req.method) {
      // case 'POST':
      //   return createSnippet(req, res)
      case 'PATCH':
        return send(res, 200, await updateSnippet(req, res))
      case 'GET':
        return send(res, 200, await getSnippet(req, res))
    }
  } catch (err) {
    console.error(err)
    send(res, err.statusCode || 500, err.message || err)
  }

  sendError(req, res, createError(501, 'Not Implemented'))
}
