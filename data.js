// ==========================================
// KHO NHÂN VẬT & GÓI CHỦ ĐỀ (PRESET THEMES)
// ==========================================
const PRESET_THEMES = {
  SHOWBIZ: {
    id: 'SHOWBIZ',
    shortName: 'Showbiz',
    name: '🌟 Showbiz & Nghệ Sĩ',
    list: [
      'Sơn Tùng M-TP', 'Trấn Thành', 'Trường Giang', 'Mỹ Tâm', 'Đàm Vĩnh Hưng', 'Hồ Ngọc Hà',
      'HIEUTHUHAI', 'Mono', 'Soobin Hoàng Sơn', 'Đen Vâu', 'Binz', 'Karik', 'JustaTee',
      'Hòa Minzy', 'Đức Phúc', 'Erik', 'Chi Pu', 'Ninh Dương Lan Ngọc', 'Diệu Nhi',
      'Lê Dương Bảo Lâm', 'Thùy Tiên', 'H\'Hen Niê', 'Hoàng Thùy Linh', 'Quang Hùng MasterD',
      'Rhyder', 'Isaac', 'Noo Phước Thịnh', 'Vũ', 'Thu Trang', 'Tiến Luật', 'Anh Tú Atus',
      'Taylor Swift', 'Justin Bieber', 'Michael Jackson', 'Bruno Mars', 'Lady Gaga',
      'Billie Eilish', 'Ed Sheeran', 'Leonardo DiCaprio', 'Tom Cruise', 'Johnny Depp',
      'Brad Pitt', 'Robert Downey Jr.', 'Dwayne Johnson (The Rock)', 'Will Smith', 'Tom Holland',
      'Thành Long (Jackie Chan)', 'Châu Tinh Trì', 'G-Dragon', 'Lisa (Blackpink)',
      'Jennie (Blackpink)', 'Jungkook (BTS)', 'IU', 'Lee Min Ho'
    ]
  },
  STREAMER: {
    id: 'STREAMER',
    shortName: 'Streamer/Creator',
    name: '🎮 Streamer & Content Creator',
    list: [
      'Độ Mixi', 'PewPew', 'Cris Devil Gamer', 'Xemesis', 'MisThy', 'Linh Ngọc Đàm',
      'Thầy Giáo Ba', 'Optimus', 'SofM', 'QNT', 'Rambo', 'Mimosa', 'MrBeast',
      'IShowSpeed', 'Khaby Lame', 'PewDiePie', 'Ninja', 'Kai Cenat'
    ]
  },
  MEME: {
    id: 'MEME',
    shortName: 'Internet Meme',
    name: '🐸 Internet Meme Toàn Cầu',
    list: [
      'Pepe The Frog', 'Doge (Chó Shiba)', 'GigaChad', 'Cheems', 'Nyan Cat',
      'Hasbulla', 'Rick Astley (Rickroll)', 'Salt Bae', 'Grumpy Cat (Mèo Quạu)',
      'Smudge The Cat (Mèo Bàn Ăn)', 'Side-Eye Chloe (Bé Gái Liếc Mắt)', 'Sad Keanu'
    ]
  },
  CARTOON: {
    id: 'CARTOON',
    shortName: 'Hoạt Hình Chiếu Rạp',
    name: '🏰 Hoạt Hình Chiếu Rạp (Disney/Pixar/DreamWorks)',
    list: [
      'Elsa (Nữ Hoàng Băng Giá)', 'Mickey Mouse', 'Donald Duck', 'Tom (Tom & Jerry)', 'Jerry (Tom & Jerry)',
      'Po (Kung Fu Panda)', 'Woody (Toy Story)', 'Buzz Lightyear', 'Minion (Kẻ Trộm Mặt Trăng)',
      'Simba (Vua Sư Tử)', 'Shrek (Chàng Chằn Tinh)', 'Thần Đèn Genie (Aladdin)', 'Baymax (Big Hero 6)',
      'Wall-E (Robot Biết Yêu)', 'Nemo (Đi Tìm Nemo)', 'Lightning McQueen (Cars)', 'Judy Hopps (Zootopia)',
      'Stitch (Lilo & Stitch)', 'Gru (Kẻ Trộm Mặt Trăng)', 'Rapunzel (Công Châu Tóc Mây)',
      'Gấu Pooh (Winnie the Pooh)', 'Mèo Đi Hia (Puss in Boots)'
    ]
  },
  ANIME: {
    id: 'ANIME',
    shortName: 'Anime/Manga',
    name: '⚔️ Anime & Manga Kinh Điển',
    list: [
      'Doraemon', 'Nobita', 'Shizuka', 'Chaien', 'Suneo', 'Conan', 'Ran Mori', 'Kaito Kid',
      'Son Goku', 'Vegeta', 'Naruto', 'Sasuke', 'Kakashi', 'Luffy', 'Zoro', 'Sanji',
      'Chopper', 'Levi Ackerman', 'Eren Yeager', 'Tanjiro', 'Nezuko', 'Gojo Satoru',
      'Saitama', 'Pikachu', 'L (Death Note)'
    ]
  },
  HEROES: {
    id: 'HEROES',
    shortName: 'Siêu Anh Hùng',
    name: '🦸 Siêu Anh Hùng Marvel & DC',
    list: [
      'Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Thanos', 'Black Widow',
      'Doctor Strange', 'Loki', 'Deadpool', 'Wolverine', 'Batman', 'Superman', 'Joker',
      'Wonder Woman', 'The Flash', 'Aquaman', 'Black Panther', 'Venom'
    ]
  }
};

// ==========================================
// KHO CÂU HỎI GỢI Ý CHIẾN THUẬT
// ==========================================
const QUESTION_SUGGESTIONS = {
  GENDER_APPEARANCE: {
    name: '👤 Giới tính & Ngoại hình',
    list: [
      'Tôi có phải là nam không?',
      'Tôi có phải là nữ không?',
      'Tôi có đeo kính không?',
      'Tôi có tóc dài không?',
      'Tôi có râu không?',
      'Tôi có tóc màu sáng (vàng, bạch kim, đỏ...) không?'
    ]
  },
  NATURE_REALITY: {
    name: '🌍 Nguồn gốc & Bản chất',
    list: [
      'Tôi có phải là người thật không?',
      'Tôi có phải là nhân vật hư cấu/hoạt hình không?',
      'Tôi có còn sống không?',
      'Tôi có phải là người Việt Nam không?',
      'Tôi có phải là người Châu Á không?',
      'Tôi có phải là người phương Tây/Âu Mỹ không?'
    ]
  },
  PROFESSION_ROLE: {
    name: '💼 Nghề nghiệp & Vai trò',
    list: [
      'Tôi có phải là ca sĩ không?',
      'Tôi có phải là diễn viên không?',
      'Tôi có phải là streamer hoặc YouTuber/Tiktoker không?',
      'Tôi có siêu năng lực/phép thuật không?',
      'Tôi có thuộc giới giải trí/Showbiz không?'
    ]
  },
  CHARACTER_TRAIT: {
    name: '✨ Đặc điểm nhận diện',
    list: [
      'Tôi là nhân vật chính diện (người tốt) phải không?',
      'Tôi có phải là động vật/thú cưng không?',
      'Tôi có câu nói/câu cửa miệng nổi tiếng nào không?',
      'Tôi có mang theo vũ khí hoặc trang bị đặc biệt không?'
    ]
  }
};

window.PRESET_THEMES = PRESET_THEMES;
window.QUESTION_SUGGESTIONS = QUESTION_SUGGESTIONS;
