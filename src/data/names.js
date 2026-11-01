/*
 * SentinelAI — word lists for name detection (all lowercase).
 * Kept small on purpose (~25 KB): the lists only raise or lower confidence,
 * they never decide on their own. Extend them freely.
 */
(function (root) {
  "use strict";

  const split = (s) => s.trim().split(/\s+/);

  const INDIAN_FIRST = split(`
    aarav aaradhya aarti aarush abhay abhijit abhinav abhishek aditi aditya ajay akash akhil akshay akshita alok aman
    amit amita amitabh amol amrita anand ananya anil anirudh anita anjali ankit ankita anshul anuj anup anupam anurag
    anushka aparna archana arjun arnav arpita arun aruna arvind ashish ashok ashwin atul avinash ayaan ayesha ayush
    bhavana bhavna bharat bhaskar chetan chirag darshan deepa deepak deepika devansh dhruv dinesh divya gaurav gautam
    geeta gopal govind harish harsh harsha hemant hitesh isha ishaan ishita jagdish jaya jatin jyoti kabir kajal
    kamala karan kartik karthik kavita kavya keerthi kishore kriti kunal lata madhav madhu mahesh manish manisha manoj
    mansi manasa meena meera megha mehul mohit mukesh nandini naresh naveen navya neelam neha nikhil nikita nilesh nisha
    nitin nidhi omkar pallavi pankaj parth pooja prabhu pradeep prakash pranav prashant prateek pratik praveen preeti
    priya priyanka rachna raghav rahul rajat rajesh rajiv rakesh ramesh ranjit rashmi ravi reena rekha renu reshma riya
    rohan rohit ronak roshni ruchi rupa sachin sahil sakshi samir sameer sandeep sanjay sanjana santosh sapna sarita
    satish saurabh seema shalini shankar sharad shikha shilpa shivam shreya shruti shubham siddharth simran sneha
    sonal sonia srinivas subhash sudha sudhir sumit sunil sunita suraj suresh sushma swati tanvi tanya tarun tushar
    umesh usha vaibhav vandana varun vasudha vidya vijay vikas vikram vinay vinod vipin vishal vivek yash yogesh zoya
    farhan faisal imran irfan javed kareem mohammed mohammad mohd nadeem rehan salman sana shabana shahid sohail tariq
    zainab zara aamir arif asif ayan fatima harpreet gurpreet manpreet jaspreet simranjeet harjit balwinder kuldeep
    navjot rupinder sukhwinder venkatesh venkat srinivasan subramanian murali balaji senthil karthikeyan lavanya
    saranya priyadarshini revathi keerthana sowmya anusha harini madhavi sravani tejaswi teja vamsi chaitanya pavan
    kalyan srikanth sridhar raghu nagaraj manjunath shwetha shweta swapna sunanda debashish sourav subhajit arijit
    ankur prasenjit tanmay ritika ritu rinku aarohi kiara myra saanvi anika pari diya ira advik vihaan reyansh
    shaurya atharv krish rudra vedant yuvraj lakshya hrithik neelima sunaina pratibha nirmala kusum savita saroj
    pushpa kamlesh rajendra mahendra surendra narendra jitendra dharmendra virendra devendra yogendra brijesh
    rupesh mithun nikhita akanksha aishwarya bhumika charu ekta garima himani jhanvi khushi komal mamta monika
    nupur pragya radhika rupali sheetal shivani smita tanu vaishali yamini
  `);

  const INDIAN_LAST = split(`
    sharma verma gupta singh kumar agarwal aggarwal agrawal jain mehta shah patel desai joshi kulkarni deshpande patil
    pawar jadhav chavan shinde gaikwad naik nair menon pillai iyer iyengar rao reddy naidu chowdary chaudhary choudhary
    yadav mishra pandey tiwari dubey shukla tripathi dwivedi chaturvedi trivedi saxena srivastava shrivastava sinha
    prasad thakur rathore chauhan rajput bhatt bhat bose banerjee chatterjee mukherjee ganguly ghosh dutta
    chakraborty bhattacharya saha mondal kapoor khanna malhotra arora bhatia chopra sethi ahuja bajaj grover sood
    sachdeva dhillon gill sandhu sidhu grewal bedi kaur khan sheikh siddiqui qureshi ansari syed hussain ahmed mirza
    pathan rizvi fernandes dsouza pinto rodrigues gomes lobo mathew varghese kurian krishnan subramaniam swamy
    hegde shetty kamath bhandari rawat negi bisht goel goyal mittal bansal garg singhal jindal oberoi tandon khurana
    luthra nagpal puri sahni talwar vohra walia sangam pagolu kapadia parikh vyas pandya solanki parmar vaghela
    makwana sawant salunkhe bhosale mane kadam thakkar bhagat tyagi mahajan kashyap dixit awasthi bajpai upadhyay
    pathak ojha nigam mathur bhardwaj vashisht chandrasekhar ramachandran natarajan venkataraman
  `);

  const INTL_FIRST = split(`
    james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony donald
    steven paul andrew joshua kenneth kevin brian edward ronald timothy jason jeffrey ryan jacob gary nicholas eric
    jonathan stephen larry justin scott brandon benjamin samuel gregory alexander raymond patrick dennis jerry tyler
    aaron jose adam henry nathan douglas zachary peter kyle walter ethan jeremy harold keith roger noah gerald carl
    terry sean arthur lawrence jesse dylan bryan joe billy bruce albert willie gabriel logan alan juan wayne ralph
    randy eugene vincent russell elijah louis bobby philip johnny mary patricia jennifer linda elizabeth barbara susan
    jessica sarah karen nancy lisa betty margaret sandra ashley kimberly emily donna michelle dorothy amanda melissa
    deborah stephanie rebecca sharon laura cynthia kathleen amy shirley angela helen anna brenda pamela nicole emma
    samantha katherine christine debra rachel catherine carolyn janet maria heather diane julie joyce olivia kelly
    christina lauren joan evelyn judith megan cheryl andrea hannah martha jacqueline frances gloria ann teresa
    kathryn sara janice alice madison doris abigail julia judy sophia denise marilyn beverly danielle theresa diana
    natalie brittany charlotte marie kayla alexis lori liam oliver lucas mason mia ava isabella amelia harper ella
    chloe zoe sophie lucy wei chen yuki hiroshi kenji carlos luis miguel sofia lucia pablo diego javier mateo elena
    dmitri olga anastasia hans klaus pierre francois giulia marco luca omar yusuf hassan
  `);

  const INTL_LAST = split(`
    smith johnson williams brown jones garcia miller davis rodriguez martinez hernandez lopez gonzalez wilson anderson
    taylor moore jackson martin lee thompson white harris sanchez clark ramirez lewis robinson walker young allen
    king wright scott torres nguyen hill flores green adams nelson baker hall rivera campbell mitchell carter roberts
    gomez phillips evans turner diaz parker cruz edwards collins reyes stewart morris morales murphy cook rogers
    gutierrez ortiz morgan cooper peterson bailey reed kelly howard ramos kim cox ward richardson watson brooks chavez
    wood bennett gray mendoza ruiz hughes price alvarez castillo sanders myers long ross foster jimenez wang zhang liu
    yamamoto tanaka suzuki muller schmidt schneider fischer weber dubois rossi russo ferrari ivanov petrov
  `);

  // Words that are also common names; only counted as a name when there is a strong cue
  const COMMON_WORDS = split(`
    mark grace joy hope rose may june april august bill frank jack carol amber faith art ray guy jean victoria virginia
    austin jordan chase hunter drew sky sunny rich dawn eve holly ivy lily pearl ruby summer autumn crystal angel
    christian will jay dev ram sai raj prem asha kiran sagar chandan kamal param uday ved ali jai uma ria raja rani
    roy das sen rana dave anand george thomas jacob long young king hall green white brown gray price wood cook
    joy bobby kelly page lee kim chen ruth ann diana
  `);

  // Well-known public figures and mythological figures: low risk unless something links them to the user
  const PUBLIC_FULL = [
    "narendra modi", "rahul gandhi", "sonia gandhi", "indira gandhi", "mahatma gandhi", "jawaharlal nehru", "amit shah",
    "arvind kejriwal", "mamata banerjee", "yogi adityanath", "droupadi murmu", "nirmala sitharaman", "virat kohli",
    "sachin tendulkar", "ms dhoni", "mahendra singh dhoni", "rohit sharma", "hardik pandya", "jasprit bumrah",
    "shubman gill", "rishabh pant", "kl rahul", "ravindra jadeja", "sourav ganguly", "rahul dravid", "neeraj chopra",
    "pv sindhu", "saina nehwal", "mary kom", "sunil chhetri", "shah rukh khan", "shahrukh khan", "salman khan",
    "aamir khan", "amitabh bachchan", "deepika padukone", "priyanka chopra", "alia bhatt", "ranbir kapoor",
    "ranveer singh", "akshay kumar", "hrithik roshan", "katrina kaif", "kareena kapoor", "ar rahman",
    "lata mangeshkar", "arijit singh", "mukesh ambani", "anil ambani", "ratan tata", "gautam adani",
    "nandan nilekani", "narayana murthy", "azim premji", "sundar pichai", "satya nadella", "shantanu narayen",
    "abdul kalam", "apj abdul kalam", "bhagat singh", "subhas chandra bose", "sardar patel", "vallabhbhai patel",
    "swami vivekananda", "rabindranath tagore", "cv raman", "srinivasa ramanujan", "elon musk", "bill gates",
    "steve jobs", "mark zuckerberg", "jeff bezos", "sam altman", "tim cook", "jensen huang", "warren buffett",
    "donald trump", "joe biden", "barack obama", "kamala harris", "taylor swift", "cristiano ronaldo",
    "lionel messi", "roger federer", "rafael nadal", "serena williams", "albert einstein", "isaac newton",
    "charles darwin", "marie curie", "nikola tesla", "william shakespeare", "abraham lincoln",
    "martin luther king", "nelson mandela", "winston churchill", "adolf hitler", "karl marx", "mother teresa",
    "dalai lama", "pope francis", "vladimir putin", "xi jinping", "rishi sunak", "keir starmer", "emmanuel macron",
    "dario amodei", "greg brockman", "ilya sutskever", "andrej karpathy", "geoffrey hinton", "yann lecun",
    "alan turing", "ada lovelace", "jane austen", "chetan bhagat", "ruskin bond", "premchand", "kalidas"
  ];

  const PUBLIC_SINGLE = split(`
    modi gandhi nehru kohli tendulkar dhoni ambani adani nadella pichai musk einstein newton trump obama biden
    shakespeare krishna arjun arjuna rama sita hanuman shiva ganesh ganesha lakshmi laxmi durga radha ravana karna
    bhishma draupadi yudhishthira bhima duryodhana buddha mahavira guru nanak ambedkar kalam tagore
  `);

  // Capitalised words that are never names in this context
  const NOT_NAMES = split(`
    i the a an and or but is am are was were be been from at in on for to of with by as my your his her our their
    this that these those it its he she they we you me him them hai hu hoon hun ka ki ke ko se ne aur bhi ji sir
    madam team hr manager ceo cto cfo vp mr mrs ms dr prof monday tuesday wednesday thursday friday saturday sunday
    january february march july september october november december today tomorrow yesterday india delhi mumbai
    bangalore bengaluru hyderabad chennai kolkata pune noida gurgaon gurugram google microsoft amazon apple meta
    openai anthropic claude chatgpt gpt gemini copilot perplexity siri alexa bard llama mistral python java
    javascript typescript react node sql excel please hi hello hey dear thanks thank regards ok okay yes no also
    here there what when where why how can could would should will just so if then not all any new best good
    project client customer patient user admin test example sample dummy note subject re fwd urgent important
    bank account card number phone email address office company limited ltd pvt inc university college school
    hospital clinic street road nagar colony sector lane floor flat apartment main
  `);

  root.SentinelNames = {
    first: new Set(INDIAN_FIRST.concat(INTL_FIRST)),
    last: new Set(INDIAN_LAST.concat(INTL_LAST)),
    common: new Set(COMMON_WORDS),
    publicFull: new Set(PUBLIC_FULL),
    publicSingle: new Set(PUBLIC_SINGLE),
    notNames: new Set(NOT_NAMES)
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SentinelNames;
})(typeof self !== "undefined" ? self : this);
