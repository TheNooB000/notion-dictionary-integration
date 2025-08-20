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
    
    // Basic word information
    const meaning = data[0].meanings[0];
    const definition = meaning.definitions[0]?.definition || '';
    const example = meaning.definitions[0]?.example || '';
    const partOfSpeech = meaning.partOfSpeech || '';
    const synonyms = meaning.synonyms || [];
    const antonyms = meaning.antonyms || [];
    
    // Determine language (Free Dictionary API is English-only, but we could extend this)
    const language = 'English';
    
    // Generate tags based on part of speech and word characteristics
    const tags = generateTags(word, partOfSpeech, definition);
    
    return {
      definition,
      example,
      partOfSpeech,
      language,
      tags,
      synonyms: synonyms.join(', '),
      antonyms: antonyms.join(', ')
    };
  } catch (error) {
    console.error(`Error fetching definition for word ${word}:`, error);
    return null;
  }
}

// Function to generate tags based on word characteristics
function generateTags(word, partOfSpeech, definition) {
  const tags = [];
  
  // Add tag based on part of speech
  if (partOfSpeech) {
    tags.push(partOfSpeech.charAt(0).toUpperCase() + partOfSpeech.slice(1));
  }
  
  // Check for academic words
  const academicKeywords = ['theory', 'concept', 'framework', 'analysis', 'research', 'scholarly', 'academic', 'study', 'science'];
  if (academicKeywords.some(keyword => definition.toLowerCase().includes(keyword))) {
    tags.push('Academic');
  }
  
  // Check for technical terms
  const techKeywords = ['technology', 'digital', 'computer', 'software', 'hardware', 'device', 'technical', 'system', 'data'];
  if (techKeywords.some(keyword => definition.toLowerCase().includes(keyword))) {
    tags.push('Technology');
  }
  
  // Check for literary terms
  const literaryKeywords = ['literary', 'novel', 'poem', 'writer', 'narrative', 'character', 'fiction', 'literature', 'story'];
  if (literaryKeywords.some(keyword => definition.toLowerCase().includes(keyword))) {
    tags.push('Literature');
  }
  
  // Check for business terms
  const businessKeywords = ['business', 'finance', 'economic', 'market', 'trade', 'company', 'corporate', 'commercial', 'management'];
  if (businessKeywords.some(keyword => definition.toLowerCase().includes(keyword))) {
    tags.push('Business');
  }

  // Add a default tag if none were added
  if (tags.length <= 1) {
    tags.push('General');
  }
  
  // Return unique tags (no duplicates)
  return [...new Set(tags)];
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
        const updateData = {
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
            'Language': {
              select: { name: definitionData.language }
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
        };
        
        // Add tags if they exist
        if (definitionData.tags && definitionData.tags.length > 0) {
          updateData.properties['Tags'] = {
            multi_select: definitionData.tags.map(tag => ({ name: tag }))
          };
        }
        
        await notion.pages.update(updateData);
        
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
