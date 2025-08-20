const { Client } = require('@notionhq/client');
const fetch = require('node-fetch');

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const databaseId = process.env.NOTION_DATABASE_ID;

async function fetchFromDictionaryAPI(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    
    if (!response.ok) {
      console.log(`No definition found for word: ${word}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || !data[0] || !data[0].meanings || !data[0].meanings[0]) {
      console.log(`Invalid data structure for word: ${word}`);
      return null;
    }
    
    const meaning = data[0].meanings[0];
    const definition = meaning.definitions[0]?.definition || '';
    const example = meaning.definitions[0]?.example || '';
    const partOfSpeech = meaning.partOfSpeech || '';
    const synonyms = meaning.synonyms || [];
    const antonyms = meaning.antonyms || [];
    
    return {
      definition,
      example,
      partOfSpeech,
      synonyms: synonyms.join(', '),
      antonyms: antonyms.join(', ')
    };
  } catch (error) {
    console.error(`Error fetching definition for word ${word}:`, error);
    return null;
  }
}

async function updateWordDefinition() {
  try {
    // 1. Get recently added words with empty definitions
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          { property: 'Definition', rich_text: { is_empty: true } },
          { property: 'Word', title: { is_not_empty: true } }
        ]
      }
    });
    
    console.log(`Found ${response.results.length} words with empty definitions`);
    
    // 2. For each word, fetch definition from dictionary API
    for (const page of response.results) {
      try {
        const word = page.properties.Word.title[0].plain_text;
        console.log(`Processing word: ${word}`);
        
        const definitionData = await fetchFromDictionaryAPI(word);
        
        if (!definitionData) {
          console.log(`No definition data found for ${word}, skipping update`);
          continue;
        }
        
        // 3. Update the Notion database with the fetched information
        await notion.pages.update({
          page_id: page.id,
          properties: {
            'Definition': { 
              rich_text: [{ text: { content: definitionData.definition } }] 
            },
            'Example Sentence': { 
              rich_text: [{ text: { content: definitionData.example } }] 
            },
            'Part of Speech': {
              select: { name: capitalizeFirstLetter(definitionData.partOfSpeech) }
            },
            'Synonyms': {
              rich_text: [{ text: { content: definitionData.synonyms } }]
            },
            'Antonyms': {
              rich_text: [{ text: { content: definitionData.antonyms } }]
            },
            'Date Added': {
              date: { start: new Date().toISOString().split('T')[0] }
            }
          }
        });
        
        console.log(`Updated word: ${word}`);
      } catch (error) {
        console.error(`Error processing page:`, error);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

updateWordDefinition()
  .then(() => console.log('Process completed'))
  .catch((error) => console.error('Error in main process:', error));
