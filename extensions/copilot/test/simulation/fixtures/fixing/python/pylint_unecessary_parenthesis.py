# Define a list of participant
participant = ['Monalisa', 'Akbar Hossain',
               'Jakir Hasan', 'Zahadur Rahman', 'Zenifer Lopez']

# Define the function to filters selected candidates
def selected_person(part):
    selected = ['Akbar Hossain', 'Zillur Rahman', 'Monalisa']
    if (part in selected):
        return True
    return False

selectedList = filter(selected_person, participant)

print('The selected candidates are:')
for candidate in selectedList:
    print(candidate)
