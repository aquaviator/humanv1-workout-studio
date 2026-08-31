import re
import os

with open('src/App.tsx', 'r') as f:
    content = f.read()

# We need to extract the components: Dashboard, WorkoutsList, PlansList, ExerciseLibrary, ProtocolLibrary, AccountSettings
# And remove them from App.tsx

components = ['Dashboard', 'WorkoutsList', 'PlansList', 'ExerciseLibrary', 'ProtocolLibrary', 'AccountSettings']

# Instead of regex, I'll just write them manually because it's safer.
