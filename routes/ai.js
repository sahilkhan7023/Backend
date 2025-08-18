const express = require('express');
const { body, validationResult } = require('express-validator');
const OpenAI = require('openai');
const User = require('../models/User');
const Progress = require('../models/Progress');
const Subscription = require('../models/Subscription');
const VocabItem = require('../models/VocabItem');
const { authenticateToken, checkFeatureAccess } = require('../middleware/auth');

const router = express.Router();

// Educational response generator
function generateEducationalResponse(message, language, context, difficulty, nativeLanguage) {
  const lowerMessage = message.toLowerCase();
  
  // Language-specific educational content
  const languageContent = {
    spanish: {
      greetings: {
        beginner: "¡Hola! Let me teach you basic Spanish greetings:\n\n• **Hola** (OH-lah) = Hello\n• **Buenos días** (BWAY-nos DEE-ahs) = Good morning\n• **Buenas tardes** (BWAY-nas TAR-des) = Good afternoon\n• **¿Cómo estás?** (KOH-moh es-TAHS) = How are you?\n• **Me llamo...** (meh YAH-moh) = My name is...\n\nTry using these in a sentence!",
        intermediate: "¡Perfecto! Here are more advanced Spanish greetings:\n\n• **¿Qué tal?** (keh tahl) = How's it going? (informal)\n• **Mucho gusto** (MOO-choh GOOS-toh) = Nice to meet you\n• **¿De dónde eres?** (deh DOHN-deh EH-res) = Where are you from?\n• **Encantado/a** (en-kan-TAH-doh) = Delighted to meet you\n\nPractice: Try introducing yourself using these phrases!"
      },
      food: {
        beginner: "Let's learn Spanish food vocabulary:\n\n• **La comida** (lah koh-MEE-dah) = Food\n• **El agua** (el AH-gwah) = Water\n• **El pan** (el pahn) = Bread\n• **La fruta** (lah FROO-tah) = Fruit\n• **Me gusta...** (meh GOOS-tah) = I like...\n\nExample: 'Me gusta la pizza' = I like pizza"
      },
      family: {
        beginner: "Spanish family vocabulary:\n\n• **La familia** (lah fah-MEE-lee-ah) = Family\n• **El padre/papá** (el PAH-dreh/pah-PAH) = Father/dad\n• **La madre/mamá** (lah MAH-dreh/mah-MAH) = Mother/mom\n• **El hermano** (el er-MAH-noh) = Brother\n• **La hermana** (lah er-MAH-nah) = Sister\n\nTry describing your family!"
      }
    },
    french: {
      greetings: {
        beginner: "Bonjour! Let's learn French greetings:\n\n• **Bonjour** (bon-ZHOOR) = Hello/Good morning\n• **Bonsoir** (bon-SWAHR) = Good evening\n• **Comment allez-vous?** (koh-mahn tah-lay VOO) = How are you? (formal)\n• **Je m'appelle...** (zhuh mah-PELL) = My name is...\n• **Enchanté(e)** (ahn-shahn-TAY) = Nice to meet you"
      }
    },
    german: {
      greetings: {
        beginner: "Guten Tag! German greetings:\n\n• **Hallo** (HAH-loh) = Hello\n• **Guten Morgen** (GOO-ten MOR-gen) = Good morning\n• **Wie geht es Ihnen?** (vee gayt es EE-nen) = How are you? (formal)\n• **Ich heiße...** (ikh HIGH-seh) = My name is...\n• **Freut mich** (froyt mikh) = Nice to meet you"
      }
    }
  };

  // Context-based responses
  if (context === 'grammar') {
    return generateGrammarResponse(message, language, difficulty);
  }

  // Check for specific topics
  if (lowerMessage.includes('hello') || lowerMessage.includes('greet') || lowerMessage.includes('introduce') || lowerMessage.includes('good morning') || lowerMessage.includes('buenos días')) {
    const content = languageContent[language]?.greetings?.[difficulty];
    if (content) return content;
  }

  if (lowerMessage.includes('food') || lowerMessage.includes('eat') || lowerMessage.includes('drink')) {
    const content = languageContent[language]?.food?.[difficulty];
    if (content) return content;
  }

  if (lowerMessage.includes('family') || lowerMessage.includes('parent') || lowerMessage.includes('brother') || lowerMessage.includes('sister')) {
    const content = languageContent[language]?.family?.[difficulty];
    if (content) return content;
  }

  // Default encouraging response
  const encouragingResponses = [
    `Great question! I'm here to help you learn ${language}. What specific topic would you like to practice? I can help with greetings, food vocabulary, family terms, or basic grammar.`,
    `¡Excelente! Let's practice ${language} together. Would you like to learn about greetings, everyday vocabulary, or perhaps some basic conversation phrases?`,
    `Perfect! I'm excited to help you with ${language}. What interests you most - pronunciation, vocabulary, or conversation practice?`
  ];

  return encouragingResponses[Math.floor(Math.random() * encouragingResponses.length)];
}

function generateGrammarResponse(message, language, difficulty) {
  const grammarTips = {
    spanish: {
      beginner: [
        "In Spanish, nouns have gender (masculine/feminine). Most words ending in -a are feminine (la mesa = the table), and most ending in -o are masculine (el libro = the book).",
        "Spanish verbs change based on who is doing the action. 'Yo hablo' (I speak), 'Tú hablas' (you speak), 'Él habla' (he speaks).",
        "Questions in Spanish often start with an upside-down question mark: ¿Cómo estás? (How are you?)"
      ],
      intermediate: [
        "The subjunctive mood in Spanish expresses doubt, emotion, or hypothetical situations. Example: 'Espero que tengas un buen día' (I hope you have a good day).",
        "Ser vs. Estar both mean 'to be' but have different uses. Ser for permanent characteristics, Estar for temporary states or locations."
      ]
    }
  };

  const tips = grammarTips[language]?.[difficulty] || ["Grammar is important for clear communication. Keep practicing!"];
  return tips[Math.floor(Math.random() * tips.length)];
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE
});

// Test OpenAI connection
router.get('/test', async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'Say hello in Spanish'
        }
      ],
      max_tokens: 50
    });

    res.json({
      message: 'OpenAI API is working',
      response: completion.choices[0].message.content
    });
  } catch (error) {
    console.error('OpenAI test error:', error);
    res.status(500).json({
      message: 'OpenAI API test failed',
      error: error.message
    });
  }
});

// AI Chat conversation
router.post('/chat', authenticateToken, [
  body('message').isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters'),
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('context').optional().isIn(['general', 'grammar', 'vocabulary', 'pronunciation', 'conversation']).withMessage('Invalid context'),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { message, language, context = 'general', difficulty = 'beginner' } = req.body;
    const userId = req.user._id;

    // Get user's learning context
    const progress = await Progress.findOne({ userId, language });
    const userLevel = req.user.level;
    const nativeLanguage = req.user.nativeLanguage;

    // Build system prompt based on context and user level
    const systemPrompts = {
      general: `You are an AI language tutor helping a ${difficulty} level student learn ${language}. The student's native language is ${nativeLanguage}. Be encouraging, patient, and provide clear explanations. Always respond in a mix of ${language} and ${nativeLanguage} to help with comprehension.`,
      
      grammar: `You are an AI grammar tutor for ${language}. Help the ${difficulty} level student understand grammar rules, provide examples, and correct mistakes. Explain grammar concepts clearly in both ${language} and ${nativeLanguage}.`,
      
      vocabulary: `You are an AI vocabulary tutor for ${language}. Help the ${difficulty} level student learn new words, understand meanings, and use them in context. Provide translations, examples, and memory techniques.`,
      
      pronunciation: `You are an AI pronunciation coach for ${language}. Help the ${difficulty} level student with pronunciation, phonetics, and speaking practice. Provide phonetic transcriptions and pronunciation tips.`,
      
      conversation: `You are an AI conversation partner for ${language}. Engage in natural conversation with the ${difficulty} level student. Keep the conversation appropriate for their level and encourage them to practice speaking.`
    };

    // Create conversation messages
    const messages = [
      {
        role: 'system',
        content: systemPrompts[context]
      },
      {
        role: 'user',
        content: message
      }
    ];

    // Try OpenAI first, fallback to educational responses
    let aiResponse;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });
      aiResponse = completion.choices[0].message.content;
    } catch (error) {
      console.log('OpenAI API unavailable, using fallback responses');
      // Always use educational responses as fallback
      aiResponse = generateEducationalResponse(message, language, context, difficulty, nativeLanguage);
    }

    // Award XP for AI interaction
    const xpReward = 5;
    req.user.addXP(xpReward);
    await req.user.save();

    res.json({
      message: 'AI response generated successfully',
      response: {
        content: aiResponse,
        context,
        xpEarned: xpReward
      }
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    
    if (error.code === 'insufficient_quota' || error.status === 429) {
      return res.status(429).json({
        message: 'AI service temporarily unavailable. Please try again later.',
        code: 'AI_SERVICE_UNAVAILABLE'
      });
    }

    res.status(500).json({
      message: 'Failed to generate AI response',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Grammar check and correction
router.post('/grammar-check', authenticateToken, checkFeatureAccess('aiChatMessages'), [
  body('text').isLength({ min: 1, max: 2000 }).withMessage('Text must be between 1 and 2000 characters'),
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { text, language } = req.body;
    const nativeLanguage = req.user.nativeLanguage;

    const prompt = `Please check the following ${language} text for grammar, spelling, and style errors. Provide corrections and explanations in ${nativeLanguage}:

Text to check: "${text}"

Please respond in JSON format with:
{
  "correctedText": "the corrected version",
  "errors": [
    {
      "original": "incorrect phrase",
      "corrected": "correct phrase",
      "explanation": "explanation of the error",
      "type": "grammar|spelling|style"
    }
  ],
  "overallFeedback": "general feedback about the text"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert ${language} grammar checker and language tutor. Always respond with valid JSON.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      result = {
        correctedText: text,
        errors: [],
        overallFeedback: completion.choices[0].message.content
      };
    }

    // Update subscription usage
    req.subscription.incrementUsage('aiChatMessages');
    await req.subscription.save();

    // Award XP
    const xpReward = 10;
    req.user.addXP(xpReward);
    await req.user.save();

    res.json({
      message: 'Grammar check completed',
      result: {
        ...result,
        xpEarned: xpReward,
        remainingChecks: req.subscription.getRemainingUsage('aiChatMessages')
      }
    });

  } catch (error) {
    console.error('Grammar check error:', error);
    res.status(500).json({
      message: 'Failed to check grammar',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Translation service
router.post('/translate', authenticateToken, checkFeatureAccess('aiChatMessages'), [
  body('text').isLength({ min: 1, max: 1000 }).withMessage('Text must be between 1 and 1000 characters'),
  body('fromLanguage').isLength({ min: 2, max: 5 }).withMessage('Valid source language code required'),
  body('toLanguage').isLength({ min: 2, max: 5 }).withMessage('Valid target language code required'),
  body('includeExplanation').optional().isBoolean().withMessage('Include explanation must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { text, fromLanguage, toLanguage, includeExplanation = false } = req.body;

    let prompt = `Translate the following text from ${fromLanguage} to ${toLanguage}: "${text}"`;
    
    if (includeExplanation) {
      prompt += `\n\nPlease also provide a brief explanation of any interesting grammar structures, idioms, or cultural context in the translation.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator specializing in ${fromLanguage} to ${toLanguage} translation. Provide accurate, natural translations.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 400,
      temperature: 0.3
    });

    const translation = completion.choices[0].message.content;

    // Update subscription usage
    req.subscription.incrementUsage('aiChatMessages');
    await req.subscription.save();

    // Award XP
    const xpReward = 3;
    req.user.addXP(xpReward);
    await req.user.save();

    res.json({
      message: 'Translation completed',
      result: {
        originalText: text,
        translatedText: translation,
        fromLanguage,
        toLanguage,
        xpEarned: xpReward,
        remainingTranslations: req.subscription.getRemainingUsage('aiChatMessages')
      }
    });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      message: 'Failed to translate text',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Generate vocabulary practice
router.post('/vocabulary-practice', authenticateToken, checkFeatureAccess('aiChatMessages'), [
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  body('category').optional().isString().withMessage('Category must be a string'),
  body('count').optional().isInt({ min: 1, max: 20 }).withMessage('Count must be between 1 and 20')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { language, difficulty = 'beginner', category = 'general', count = 10 } = req.body;
    const nativeLanguage = req.user.nativeLanguage;

    // Get existing vocabulary from database
    const existingVocab = await VocabItem.find({
      language,
      difficulty,
      ...(category !== 'general' && { category }),
      isActive: true
    }).limit(count);

    let vocabularyItems = [];

    if (existingVocab.length >= count) {
      // Use existing vocabulary
      vocabularyItems = existingVocab.slice(0, count).map(item => ({
        word: item.word,
        translation: item.translation,
        definition: item.definition,
        examples: item.examples.slice(0, 2),
        partOfSpeech: item.partOfSpeech
      }));
    } else {
      // Generate new vocabulary with AI
      const prompt = `Generate ${count} ${difficulty} level ${language} vocabulary words for the category "${category}". 
      
      For each word, provide:
      - The word in ${language}
      - Translation to ${nativeLanguage}
      - Definition in ${nativeLanguage}
      - 2 example sentences in ${language} with ${nativeLanguage} translations
      - Part of speech
      
      Format as JSON array with this structure:
      [
        {
          "word": "word in ${language}",
          "translation": "translation in ${nativeLanguage}",
          "definition": "definition in ${nativeLanguage}",
          "examples": [
            {
              "sentence": "example in ${language}",
              "translation": "translation in ${nativeLanguage}"
            }
          ],
          "partOfSpeech": "noun|verb|adjective|etc"
        }
      ]`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a ${language} vocabulary expert. Always respond with valid JSON.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      });

      try {
        vocabularyItems = JSON.parse(completion.choices[0].message.content);
      } catch (parseError) {
        // Fallback to existing vocabulary if AI generation fails
        vocabularyItems = existingVocab.slice(0, Math.min(count, existingVocab.length));
      }
    }

    // Update subscription usage
    req.subscription.incrementUsage('aiChatMessages');
    await req.subscription.save();

    // Award XP
    const xpReward = vocabularyItems.length * 2;
    req.user.addXP(xpReward);
    await req.user.save();

    res.json({
      message: 'Vocabulary practice generated',
      vocabularyItems,
      xpEarned: xpReward,
      remainingGenerations: req.subscription.getRemainingUsage('aiChatMessages')
    });

  } catch (error) {
    console.error('Vocabulary practice error:', error);
    res.status(500).json({
      message: 'Failed to generate vocabulary practice',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Generate conversation starters
router.post('/conversation-starters', authenticateToken, checkFeatureAccess('aiChatMessages'), [
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  body('topic').optional().isString().withMessage('Topic must be a string'),
  body('count').optional().isInt({ min: 1, max: 10 }).withMessage('Count must be between 1 and 10')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { language, difficulty = 'beginner', topic = 'general', count = 5 } = req.body;
    const nativeLanguage = req.user.nativeLanguage;

    const prompt = `Generate ${count} conversation starters in ${language} for ${difficulty} level learners on the topic of "${topic}". 

    For each conversation starter, provide:
    - A question or statement in ${language}
    - Translation to ${nativeLanguage}
    - 2-3 possible responses in ${language} with translations
    - Cultural context or tips if relevant

    Format as JSON array.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a ${language} conversation expert. Create engaging conversation starters appropriate for language learners. Always respond with valid JSON.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.8
    });

    let conversationStarters;
    try {
      conversationStarters = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      conversationStarters = [{
        question: "¿Cómo estás?",
        translation: "How are you?",
        responses: [
          { text: "Muy bien, gracias", translation: "Very well, thank you" },
          { text: "No muy bien", translation: "Not very well" }
        ]
      }];
    }

    // Update subscription usage
    req.subscription.incrementUsage('aiChatMessages');
    await req.subscription.save();

    // Award XP
    const xpReward = 8;
    req.user.addXP(xpReward);
    await req.user.save();

    res.json({
      message: 'Conversation starters generated',
      conversationStarters,
      xpEarned: xpReward,
      remainingGenerations: req.subscription.getRemainingUsage('aiChatMessages')
    });

  } catch (error) {
    console.error('Conversation starters error:', error);
    res.status(500).json({
      message: 'Failed to generate conversation starters',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get AI usage statistics
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });
    
    if (!subscription) {
      return res.status(404).json({
        message: 'Subscription not found'
      });
    }

    const usage = {
      plan: subscription.plan,
      aiChatMessages: {
        used: subscription.usage.currentPeriod.aiChatMessages || 0,
        limit: subscription.features.aiChatLimit,
        remaining: subscription.getRemainingUsage('aiChatMessages')
      },
      resetDate: subscription.currentPeriodEnd || subscription.usage.currentPeriod.lastReset
    };

    res.json({
      message: 'AI usage retrieved successfully',
      usage
    });

  } catch (error) {
    console.error('AI usage error:', error);
    res.status(500).json({
      message: 'Failed to retrieve AI usage',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

