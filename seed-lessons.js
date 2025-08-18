const mongoose = require('mongoose');
const Lesson = require('./models/Lesson');
const User = require('./models/User');
require('dotenv').config();

const lessons = [
  {
    title: "Basic Greetings",
    description: "Learn essential greetings and polite expressions in Spanish",
    language: "es",
    category: "conversation",
    difficulty: "beginner",
    level: 1,
    content: {
      introduction: {
        text: "Welcome to your first Spanish lesson! Today we'll learn the most common greetings and polite expressions that you'll use every day.",
        audioUrl: "/audio/greetings-intro.mp3"
      },
      sections: [
        {
          title: "Common Greetings",
          type: "text",
          content: {
            text: "Here are the most important greetings:\n• Hola - Hello\n• Buenos días - Good morning\n• Buenas tardes - Good afternoon\n• Buenas noches - Good evening/night\n• ¿Cómo estás? - How are you?\n• Muy bien, gracias - Very well, thank you"
          },
          order: 1
        },
        {
          title: "Practice Pronunciation",
          type: "audio",
          content: {
            audioUrl: "/audio/greetings-practice.mp3",
            transcript: "Listen and repeat: Hola, Buenos días, Buenas tardes..."
          },
          order: 2
        }
      ],
      summary: {
        text: "You've learned the basic greetings in Spanish. Practice using them in your daily conversations!",
        keyPoints: ["Hola is the most common greeting", "Time-specific greetings show politeness", "Always respond to ¿Cómo estás?"]
      }
    },
    objectives: [
      "Greet people appropriately in Spanish",
      "Ask and answer how someone is doing",
      "Use polite expressions in conversation"
    ],
    newWords: [
      { word: "Hola", translation: "Hello", definition: "A casual greeting used at any time", examples: ["Hola, ¿cómo estás?"] },
      { word: "Buenos días", translation: "Good morning", definition: "Formal morning greeting", examples: ["Buenos días, señora García"] },
      { word: "Gracias", translation: "Thank you", definition: "Expression of gratitude", examples: ["Muy bien, gracias"] }
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "How do you say 'Good morning' in Spanish?",
        options: ["Buenas noches", "Buenos días", "Buenas tardes", "Hola"],
        correctAnswer: 1,
        explanation: "Buenos días is used to greet someone in the morning",
        points: 10
      },
      {
        type: "fill_blank",
        question: "Complete the greeting: '_____, ¿cómo estás?'",
        correctAnswer: "Hola",
        explanation: "Hola is the most common way to start this greeting",
        points: 15
      }
    ],
    xpReward: 50,
    estimatedDuration: 10,
    isPublished: true,
    isFree: true,
    tags: ["greetings", "basic", "conversation"]
  },
  {
    title: "Family Members",
    description: "Learn vocabulary for family relationships and how to talk about your family",
    language: "es",
    category: "vocabulary",
    difficulty: "beginner",
    level: 2,
    content: {
      introduction: {
        text: "Family is very important in Spanish-speaking cultures. Let's learn how to talk about family members.",
        audioUrl: "/audio/family-intro.mp3"
      },
      sections: [
        {
          title: "Immediate Family",
          type: "text",
          content: {
            text: "Core family members:\n• Padre/Papá - Father/Dad\n• Madre/Mamá - Mother/Mom\n• Hermano - Brother\n• Hermana - Sister\n• Hijo - Son\n• Hija - Daughter"
          },
          order: 1
        },
        {
          title: "Extended Family",
          type: "text",
          content: {
            text: "Extended family:\n• Abuelo - Grandfather\n• Abuela - Grandmother\n• Tío - Uncle\n• Tía - Aunt\n• Primo - Male cousin\n• Prima - Female cousin"
          },
          order: 2
        }
      ],
      summary: {
        text: "Now you can talk about your family in Spanish! Remember that Spanish nouns have gender.",
        keyPoints: ["Family words change based on gender", "Use 'mi' (my) before family words", "Practice with your own family"]
      }
    },
    objectives: [
      "Name immediate family members",
      "Describe family relationships",
      "Use possessive pronouns with family words"
    ],
    newWords: [
      { word: "Familia", translation: "Family", definition: "Group of related people", examples: ["Mi familia es grande"] },
      { word: "Padre", translation: "Father", definition: "Male parent", examples: ["Mi padre trabaja mucho"] },
      { word: "Madre", translation: "Mother", definition: "Female parent", examples: ["Mi madre cocina bien"] }
    ],
    exercises: [
      {
        type: "matching",
        question: "Match the Spanish word with its English translation",
        options: ["Hermano", "Sister", "Brother", "Hermana"],
        correctAnswer: [0, 2, 3, 1],
        explanation: "Remember: -o endings are usually masculine, -a endings are usually feminine",
        points: 20
      }
    ],
    xpReward: 75,
    estimatedDuration: 15,
    isPublished: true,
    isFree: true,
    tags: ["family", "vocabulary", "relationships"]
  },
  {
    title: "Food and Drinks",
    description: "Essential vocabulary for ordering food and talking about meals",
    language: "es",
    category: "vocabulary",
    difficulty: "beginner",
    level: 3,
    content: {
      introduction: {
        text: "Food is a central part of Spanish culture. Learn essential food vocabulary for restaurants and daily conversations.",
        audioUrl: "/audio/food-intro.mp3"
      },
      sections: [
        {
          title: "Basic Foods",
          type: "text",
          content: {
            text: "Common foods:\n• Pan - Bread\n• Arroz - Rice\n• Pollo - Chicken\n• Pescado - Fish\n• Verduras - Vegetables\n• Fruta - Fruit"
          },
          order: 1
        },
        {
          title: "Drinks",
          type: "text",
          content: {
            text: "Common beverages:\n• Agua - Water\n• Café - Coffee\n• Té - Tea\n• Jugo - Juice\n• Cerveza - Beer\n• Vino - Wine"
          },
          order: 2
        },
        {
          title: "Restaurant Phrases",
          type: "text",
          content: {
            text: "Useful restaurant expressions:\n• La carta, por favor - The menu, please\n• Quiero... - I want...\n• La cuenta, por favor - The check, please\n• ¿Qué recomienda? - What do you recommend?"
          },
          order: 3
        }
      ],
      summary: {
        text: "You can now order food and discuss meals in Spanish! Practice at restaurants or while cooking.",
        keyPoints: ["Use 'Quiero' to order food", "Learn food categories", "Practice restaurant etiquette"]
      }
    },
    objectives: [
      "Order food and drinks in Spanish",
      "Name common foods and beverages",
      "Use restaurant vocabulary confidently"
    ],
    newWords: [
      { word: "Comida", translation: "Food", definition: "Anything edible", examples: ["Me gusta la comida mexicana"] },
      { word: "Restaurante", translation: "Restaurant", definition: "Place to eat meals", examples: ["Vamos al restaurante"] },
      { word: "Delicioso", translation: "Delicious", definition: "Very tasty", examples: ["El pollo está delicioso"] }
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "How do you ask for the menu in Spanish?",
        options: ["La cuenta, por favor", "La carta, por favor", "El café, por favor", "El agua, por favor"],
        correctAnswer: 1,
        explanation: "'La carta' means menu in most Spanish-speaking countries",
        points: 15
      },
      {
        type: "translation",
        question: "Translate: 'I want chicken and rice'",
        correctAnswer: "Quiero pollo y arroz",
        explanation: "Use 'Quiero' (I want) + food items connected with 'y' (and)",
        points: 25
      }
    ],
    xpReward: 100,
    estimatedDuration: 20,
    isPublished: true,
    isFree: true,
    tags: ["food", "restaurant", "vocabulary", "ordering"]
  },
  {
    title: "Numbers 1-100",
    description: "Master Spanish numbers from 1 to 100 with pronunciation and usage",
    language: "es",
    category: "vocabulary",
    difficulty: "beginner",
    level: 4,
    content: {
      introduction: {
        text: "Numbers are essential for daily life. Learn to count, tell time, and handle money in Spanish.",
        audioUrl: "/audio/numbers-intro.mp3"
      },
      sections: [
        {
          title: "Numbers 1-20",
          type: "text",
          content: {
            text: "Basic numbers:\n1-uno, 2-dos, 3-tres, 4-cuatro, 5-cinco\n6-seis, 7-siete, 8-ocho, 9-nueve, 10-diez\n11-once, 12-doce, 13-trece, 14-catorce, 15-quince\n16-dieciséis, 17-diecisiete, 18-dieciocho, 19-diecinueve, 20-veinte"
          },
          order: 1
        },
        {
          title: "Tens and Hundreds",
          type: "text",
          content: {
            text: "Larger numbers:\n30-treinta, 40-cuarenta, 50-cincuenta\n60-sesenta, 70-setenta, 80-ochenta\n90-noventa, 100-cien"
          },
          order: 2
        }
      ],
      summary: {
        text: "You can now count to 100 in Spanish! Practice with prices, ages, and quantities.",
        keyPoints: ["Numbers 16-19 are compound words", "Use 'y' to connect tens and ones", "Cien vs ciento usage"]
      }
    },
    objectives: [
      "Count from 1 to 100 in Spanish",
      "Use numbers in practical situations",
      "Understand number patterns and rules"
    ],
    newWords: [
      { word: "Número", translation: "Number", definition: "Mathematical symbol", examples: ["¿Cuál es tu número de teléfono?"] },
      { word: "Precio", translation: "Price", definition: "Cost of something", examples: ["El precio es veinte euros"] },
      { word: "Edad", translation: "Age", definition: "How old someone is", examples: ["Tengo veinticinco años"] }
    ],
    exercises: [
      {
        type: "fill_blank",
        question: "Write the number: 'I am _____ years old' (25)",
        correctAnswer: "veinticinco",
        explanation: "25 = veinte (20) + cinco (5) = veinticinco",
        points: 20
      },
      {
        type: "multiple_choice",
        question: "How do you say 47 in Spanish?",
        options: ["cuarenta y siete", "cincuenta y siete", "treinta y siete", "cuarenta y ocho"],
        correctAnswer: 0,
        explanation: "47 = cuarenta (40) + y + siete (7)",
        points: 15
      }
    ],
    xpReward: 80,
    estimatedDuration: 25,
    isPublished: true,
    isFree: true,
    tags: ["numbers", "counting", "math", "practical"]
  },
  {
    title: "Present Tense Verbs",
    description: "Learn to conjugate regular verbs in the present tense",
    language: "es",
    category: "grammar",
    difficulty: "intermediate",
    level: 5,
    content: {
      introduction: {
        text: "Verb conjugation is the foundation of Spanish grammar. Master the present tense to express current actions and states.",
        audioUrl: "/audio/verbs-intro.mp3"
      },
      sections: [
        {
          title: "AR Verbs",
          type: "text",
          content: {
            text: "Regular -AR verbs (hablar - to speak):\nYo hablo - I speak\nTú hablas - You speak\nÉl/Ella habla - He/She speaks\nNosotros hablamos - We speak\nVosotros habláis - You all speak\nEllos hablan - They speak"
          },
          order: 1
        },
        {
          title: "ER and IR Verbs",
          type: "text",
          content: {
            text: "Regular -ER verbs (comer - to eat):\nYo como, Tú comes, Él come, Nosotros comemos, Vosotros coméis, Ellos comen\n\nRegular -IR verbs (vivir - to live):\nYo vivo, Tú vives, Él vive, Nosotros vivimos, Vosotros vivís, Ellos viven"
          },
          order: 2
        }
      ],
      summary: {
        text: "You now understand Spanish verb conjugation patterns! Practice with different verbs daily.",
        keyPoints: ["Each person has a unique ending", "AR, ER, IR verbs follow patterns", "Subject pronouns are often optional"]
      }
    },
    objectives: [
      "Conjugate regular verbs in present tense",
      "Understand verb ending patterns",
      "Use verbs in complete sentences"
    ],
    newWords: [
      { word: "Verbo", translation: "Verb", definition: "Action or state word", examples: ["Hablar es un verbo"] },
      { word: "Conjugar", translation: "To conjugate", definition: "Change verb form for different subjects", examples: ["Necesito conjugar este verbo"] },
      { word: "Presente", translation: "Present", definition: "Current time", examples: ["Uso el tiempo presente"] }
    ],
    exercises: [
      {
        type: "fill_blank",
        question: "Conjugate 'hablar' for 'nosotros': Nosotros _____",
        correctAnswer: "hablamos",
        explanation: "For -AR verbs, nosotros takes the -amos ending",
        points: 25
      },
      {
        type: "multiple_choice",
        question: "Which is correct for 'They eat'?",
        options: ["Ellos comen", "Ellos comes", "Ellos come", "Ellos comemos"],
        correctAnswer: 0,
        explanation: "Third person plural of 'comer' is 'comen'",
        points: 20
      }
    ],
    xpReward: 120,
    estimatedDuration: 30,
    isPublished: true,
    isFree: false,
    tags: ["grammar", "verbs", "conjugation", "present-tense"]
  }
];

async function seedLessons() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create admin user if doesn't exist
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = new User({
        username: 'admin',
        email: 'admin@linguaai.com',
        password: 'admin123',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        isEmailVerified: true
      });
      await adminUser.save();
      console.log('Admin user created');
    }

    // Clear existing lessons
    await Lesson.deleteMany({});
    console.log('Cleared existing lessons');

    // Add createdBy field to lessons
    const lessonsWithCreator = lessons.map(lesson => ({
      ...lesson,
      createdBy: adminUser._id
    }));

    // Insert new lessons
    const insertedLessons = await Lesson.insertMany(lessonsWithCreator);
    console.log(`Inserted ${insertedLessons.length} lessons`);

    console.log('Lesson seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding lessons:', error);
    process.exit(1);
  }
}

seedLessons();
