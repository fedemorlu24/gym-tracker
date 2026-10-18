// Etichette della libreria esercizi in 5 lingue; gli esercizi sono in lib/data.js (window.EXDATA).
window.EXLIB = {
  groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hams', 'calves', 'fullbody'],
  labels: {
    it: {
      groups: {chest: 'Petto', back: 'Schiena', shoulders: 'Spalle', biceps: 'Bicipiti', triceps: 'Tricipiti', quads: 'Quadricipiti', hams: 'Femorali e glutei', calves: 'Polpacci', core: 'Addome', forearms: 'Avambracci', fullbody: 'Total body'},
      muscles: {chest: 'pettorali', upperChest: 'pettorale alto', frontDelt: 'deltoide anteriore', sideDelt: 'deltoide laterale', rearDelt: 'deltoide posteriore', triceps: 'tricipiti', biceps: 'bicipiti', forearms: 'avambracci', brachialis: 'brachiale', lats: 'gran dorsale', upperBack: 'trapezio e romboidi', lowerBack: 'lombari', quads: 'quadricipiti', hams: 'femorali', glutes: 'glutei', adductors: 'adduttori', calves: 'polpacci', abs: 'addominali', obliques: 'obliqui', traps: 'trapezio', abductors: 'abduttori', hipFlexors: 'flessori dell\'anca', tibialis: 'tibiale anteriore'},
      eq: {barbell: 'Bilanciere', dumbbell: 'Manubri', machine: 'Macchina', cable: 'Cavi', bodyweight: 'Corpo libero', smith: 'Smith machine', kettlebell: 'Kettlebell', band: 'Elastici', ezbar: 'Bilanciere EZ', trapbar: 'Trap bar', landmine: 'Landmine', suspension: 'TRX', plate: 'Disco'},
      lvl: ['Facile', 'Medio', 'Avanzato'],
    },
    en: {
      groups: {chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads', hams: 'Hamstrings & glutes', calves: 'Calves', core: 'Abs', forearms: 'Forearms', fullbody: 'Full body'},
      muscles: {chest: 'chest', upperChest: 'upper chest', frontDelt: 'front delts', sideDelt: 'side delts', rearDelt: 'rear delts', triceps: 'triceps', biceps: 'biceps', forearms: 'forearms', brachialis: 'brachialis', lats: 'lats', upperBack: 'traps and rhomboids', lowerBack: 'lower back', quads: 'quads', hams: 'hamstrings', glutes: 'glutes', adductors: 'adductors', calves: 'calves', abs: 'abs', obliques: 'obliques', traps: 'traps', abductors: 'abductors', hipFlexors: 'hip flexors', tibialis: 'tibialis'},
      eq: {barbell: 'Barbell', dumbbell: 'Dumbbells', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', smith: 'Smith machine', kettlebell: 'Kettlebell', band: 'Bands', ezbar: 'EZ bar', trapbar: 'Trap bar', landmine: 'Landmine', suspension: 'Suspension trainer', plate: 'Plate'},
      lvl: ['Easy', 'Medium', 'Advanced'],
    },
    es: {
      groups: {chest: 'Pecho', back: 'Espalda', shoulders: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', quads: 'Cuádriceps', hams: 'Isquios y glúteos', calves: 'Gemelos', core: 'Abdomen', forearms: 'Antebrazos', fullbody: 'Cuerpo completo'},
      muscles: {chest: 'pectorales', upperChest: 'pectoral superior', frontDelt: 'deltoides anterior', sideDelt: 'deltoides lateral', rearDelt: 'deltoides posterior', triceps: 'tríceps', biceps: 'bíceps', forearms: 'antebrazos', brachialis: 'braquial', lats: 'dorsal ancho', upperBack: 'trapecio y romboides', lowerBack: 'lumbares', quads: 'cuádriceps', hams: 'isquiotibiales', glutes: 'glúteos', adductors: 'aductores', calves: 'gemelos', abs: 'abdominales', obliques: 'oblicuos', traps: 'trapecio', abductors: 'abductores', hipFlexors: 'flexores de cadera', tibialis: 'tibial anterior'},
      eq: {barbell: 'Barra', dumbbell: 'Mancuernas', machine: 'Máquina', cable: 'Polea', bodyweight: 'Peso corporal', smith: 'Máquina Smith', kettlebell: 'Kettlebell', band: 'Bandas', ezbar: 'Barra Z', trapbar: 'Barra hexagonal', landmine: 'Landmine', suspension: 'TRX', plate: 'Disco'},
      lvl: ['Fácil', 'Medio', 'Avanzado'],
    },
    fr: {
      groups: {chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quadriceps', hams: 'Ischios et fessiers', calves: 'Mollets', core: 'Abdos', forearms: 'Avant-bras', fullbody: 'Corps entier'},
      muscles: {chest: 'pectoraux', upperChest: 'haut des pectoraux', frontDelt: 'deltoïde antérieur', sideDelt: 'deltoïde latéral', rearDelt: 'deltoïde postérieur', triceps: 'triceps', biceps: 'biceps', forearms: 'avant-bras', brachialis: 'brachial', lats: 'grand dorsal', upperBack: 'trapèzes et rhomboïdes', lowerBack: 'lombaires', quads: 'quadriceps', hams: 'ischio-jambiers', glutes: 'fessiers', adductors: 'adducteurs', calves: 'mollets', abs: 'abdominaux', obliques: 'obliques', traps: 'trapèzes', abductors: 'abducteurs', hipFlexors: 'fléchisseurs de hanche', tibialis: 'jambier antérieur'},
      eq: {barbell: 'Barre', dumbbell: 'Haltères', machine: 'Machine', cable: 'Poulie', bodyweight: 'Poids du corps', smith: 'Smith machine', kettlebell: 'Kettlebell', band: 'Élastiques', ezbar: 'Barre EZ', trapbar: 'Trap bar', landmine: 'Landmine', suspension: 'Sangles de suspension', plate: 'Disque'},
      lvl: ['Facile', 'Moyen', 'Avancé'],
    },
    de: {
      groups: {chest: 'Brust', back: 'Rücken', shoulders: 'Schultern', biceps: 'Bizeps', triceps: 'Trizeps', quads: 'Oberschenkel vorne', hams: 'Beinbeuger und Gesäß', calves: 'Waden', core: 'Bauch', forearms: 'Unterarme', fullbody: 'Ganzkörper'},
      muscles: {chest: 'Brustmuskel', upperChest: 'obere Brust', frontDelt: 'vordere Schulter', sideDelt: 'seitliche Schulter', rearDelt: 'hintere Schulter', triceps: 'Trizeps', biceps: 'Bizeps', forearms: 'Unterarme', brachialis: 'Oberarmmuskel', lats: 'breiter Rückenmuskel', upperBack: 'Trapez und Rautenmuskeln', lowerBack: 'unterer Rücken', quads: 'Quadrizeps', hams: 'Beinbeuger', glutes: 'Gesäß', adductors: 'Adduktoren', calves: 'Waden', abs: 'Bauchmuskeln', obliques: 'seitliche Bauchmuskeln', traps: 'Trapezmuskel', abductors: 'Abduktoren', hipFlexors: 'Hüftbeuger', tibialis: 'Schienbeinmuskel'},
      eq: {barbell: 'Langhantel', dumbbell: 'Kurzhanteln', machine: 'Maschine', cable: 'Kabelzug', bodyweight: 'Körpergewicht', smith: 'Multipresse', kettlebell: 'Kettlebell', band: 'Bänder', ezbar: 'SZ-Stange', trapbar: 'Trap Bar', landmine: 'Landmine', suspension: 'Schlingentrainer', plate: 'Hantelscheibe'},
      lvl: ['Leicht', 'Mittel', 'Fortgeschritten'],
    },
  },
};
