const db = require('./db')
const fs = require('fs')
const friskis = require('./friskis')
const { startOfWeek, format, add } = require('date-fns')
const cron = require('node-cron')
require('dotenv').config()

const USER_CREDENTIALS = JSON.parse(process.env.USERS)

// Schedule daily todo-maker
cron.schedule('4 5 * * *', dailyCheck)

// Schedule booker
cron.schedule('* * * * *', doBookings)

//dailyCheck()
//doBookings()

function updateDB(newDB) {
  fs.writeFile('./db.json', JSON.stringify(newDB), (err) => {
    if (err) {
      console.error(err)
    }
  })
}

function addUser(user) {
  if (!user.name) return false

  const newUser = {
    name: user.name,
    wishes: [],
    bookings: []
  }

  db.users.push(newUser)
  updateDB(db)

  return true
}

function addWish(username, wish) {
  if (!username || username == '') return false
  if (!wish.name || !wish.weekday || !wish.start_time || !wish.place) return false

  // TODO: Check if wish already exists

  const currentUser = db.users.find((user) => user.name.toLowerCase() == username.toLowerCase())
  currentUser.wishes.push(wish)
  updateDB(db)

  return true
}

function removeWish(user, wish) {
  // TODO: Complete function
  return
}

async function dailyCheck() {
  console.log('Running: dailyCheck() - ' + new Date())
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekdays = [...new Set(db.users.map((user) => 
    user.wishes.map((wish) => wish.weekday)
  ).flat())]

  //const dates = weekdays.map((weekday) => add(monday, { days: weekday}))
  
  let schedule = []
  for (let i = 0; i < 8; i++) {
    const date = add(monday, { days: i })
    const res = await friskis.hämtaPass(date)
    schedule.push(res)
  }

  list = schedule.flat()

  db.todo = []

  db.users.forEach((user) => {
    user.wishes.forEach((wish) => {
      const todo = list.filter((l) => (
        l.name.toLowerCase() == wish.name.toLowerCase() &&
        l.place.toLowerCase() == wish.place.toLowerCase() &&
        new Date() < new Date(l.duration.start)
      ))
      .filter((l) => {
        const bookDate = new Date(l.duration.start)

        const wishDate = add(monday, { days: wish.weekday })
        wishDate.setHours(wish.start_time[0], wish.start_time[1], 0)

        return (
          bookDate.getTime() == wishDate.getTime() ||
          bookDate.getTime() == (add(wishDate, { days: 7}).getTime())
        )
      })
      .map((l) => ({
        id: l.id,
        user: user.name,
        bookableEarliest: l.bookableEarliest
      }))

      db.todo.push(todo[0])
    })
  })

  updateDB(db)
  console.log('Complete: dailyCheck() - ' + new Date())
}

async function doBookings() {
  console.log('Running: doBookings() - ' + new Date())
  const now = new Date()

  const todos = db.todo.filter((todo) => now > new Date(todo.bookableEarliest))
  console.log('Todos length:', todos.length)
  const users = [...new Set(todos.map((todo) => todo.user))].map((user) => db.users.find((storedUser) => storedUser.name == user))
  
  const tokens = []
  
  console.log('Users: ', users.length)

  for (let i = 0; i < users.length; i++) {
    const userCredentials = USER_CREDENTIALS.find((user) => user.name == users[i].name)
    const login = await friskis.loginUser(userCredentials)

    if (!login) continue

    tokens.push({
      name: users[i].name,
      username: login.username,
      token: login.token
    })
  }

  console.log('Logins complete')

  for (let i = 0; i < todos.length; i++) {
    const user = tokens.filter((t) => t.name == todos[i].user)[0]
    console.log('Todo user found: ' + user?.username)
    if (!user) continue
    
    const booked = await friskis.book(todos[i], user)
    console.log('Booking complete: ' + booked)

    if (!booked) {
      console.log('ERROR while booking:', todos[i], user.name)
    } else {
      db.todo = db.todo.filter((todo) => todo.id !== todos[i].id)
    }
  }

   updateDB(db)
   console.log('Complete: doBookings() - ' + new Date())
}
