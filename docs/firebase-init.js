var firebaseConfig = {
  projectId: "sapo-sale-tracker",
  appId: "1:1050600505159:web:b3488e229fab6625c51662",
  storageBucket: "sapo-sale-tracker.firebasestorage.app",
  apiKey: "AIzaSyAz_PIx26iCPU_qh2ptJhvuIIK75v_2wXo",
  authDomain: "sapo-sale-tracker.firebaseapp.com",
  messagingSenderId: "1050600505159"
};
firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();
